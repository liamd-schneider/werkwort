import { NextRequest, NextResponse } from 'next/server'
import { anthropic, ANGEBOT_SYSTEM_PROMPT } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { AngebotExtraktion, TOKEN_KOSTEN } from '@/types'

export async function POST(req: NextRequest) {
  try {
    // ─── 1. Auth prüfen ───────────────────────────────────
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }

    // ─── 2. Input lesen ───────────────────────────────────
    const { eingabe } = await req.json()

    if (!eingabe || typeof eingabe !== 'string' || eingabe.trim().length < 5) {
      return NextResponse.json({ error: 'Bitte beschreibe den Auftrag' }, { status: 400 })
    }

    // ─── 3. Token prüfen & abziehen ──────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenErfolg, error: tokenError } = await (supabaseAdmin as any)
      .rpc('verbrauche_token', {
        p_user_id: user.id,
        p_anzahl: TOKEN_KOSTEN.angebot,
        p_beschreibung: 'Angebot generiert',
      })

    if (tokenError || !tokenErfolg) {
      return NextResponse.json(
        { error: 'Nicht genug Token. Bitte Token kaufen.' },
        { status: 402 }
      )
    }

    // ─── 4. Preisliste des Betriebs laden ────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: preise } = await (supabaseAdmin as any)
      .from('preispositionen')
      .select('*')
      .eq('user_id', user.id)

    const preislisteText = preise && preise.length > 0
      ? '\n\nPreisliste des Betriebs:\n' +
        preise.map((p: { beschreibung: string; preis: number; einheit: string }) =>
          `- ${p.beschreibung}: ${p.preis}€/${p.einheit}`
        ).join('\n')
      : ''

    // ─── 5. KI-Anfrage an Claude ──────────────────────────
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: ANGEBOT_SYSTEM_PROMPT + preislisteText,
      messages: [{ role: 'user', content: eingabe }],
    })

    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : ''

    // ─── 6. JSON parsen ───────────────────────────────────
    let extraktion: AngebotExtraktion
    try {
      extraktion = JSON.parse(responseText)
    } catch {
      return NextResponse.json(
        { error: 'KI-Antwort konnte nicht verarbeitet werden' },
        { status: 500 }
      )
    }

    // ─── 7. MwSt & Summen berechnen ──────────────────────
    const netto  = extraktion.positionen.reduce((sum, p) => sum + p.gesamtpreis, 0)
    const mwst   = Math.round(netto * 0.19 * 100) / 100
    const brutto = Math.round((netto + mwst) * 100) / 100

    // ─── 8. Angebotsnummer generieren ────────────────────
    const jahr = new Date().getFullYear()
    const { count } = await supabaseAdmin
      .from('dokumente')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('typ', 'angebot')

    const nummer = `${jahr}-A-${String((count || 0) + 1).padStart(3, '0')}`

    // ─── 9. Angebot in DB speichern ──────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dokument, error: dbError } = await (supabaseAdmin as any)
      .from('dokumente')
      .insert({
        user_id:              user.id,
        typ:                  'angebot',
        status:               'entwurf',
        nummer,
        kunde_name:           extraktion.kunde.name,
        kunde_adresse:        extraktion.kunde.adresse,
        positionen:           extraktion.positionen,
        netto,
        mwst,
        brutto,
        anmerkungen:          extraktion.anmerkungen,
        ausfuehrungszeitraum: extraktion.ausfuehrungszeitraum,
        gueltig_bis:          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                .toISOString().split('T')[0],
        token_verbraucht:     TOKEN_KOSTEN.angebot,
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: dokument })

  } catch (error) {
    console.error('Angebot API Fehler:', error)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
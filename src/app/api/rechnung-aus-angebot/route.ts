import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { TOKEN_KOSTEN } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { angebotId } = await req.json()
    if (!angebotId) return NextResponse.json({ error: 'Angebot-ID fehlt' }, { status: 400 })

    // Angebot laden
    const { data: angebot, error: loadErr } = await (supabaseAdmin as any)
      .from('dokumente')
      .select('*')
      .eq('id', angebotId)
      .eq('user_id', user.id)
      .eq('typ', 'angebot')
      .single()

    if (loadErr || !angebot) return NextResponse.json({ error: 'Angebot nicht gefunden' }, { status: 404 })

    // Token abziehen
    const { data: tokenOk } = await (supabaseAdmin as any).rpc('verbrauche_token', {
      p_user_id: user.id,
      p_anzahl: TOKEN_KOSTEN.rechnung,
      p_beschreibung: 'Rechnung aus Angebot erstellt',
    })
    if (!tokenOk) return NextResponse.json({ error: 'Nicht genug Token' }, { status: 402 })

    // Rechnungsnummer generieren
    const jahr = new Date().getFullYear()
    const { count } = await (supabaseAdmin as any)
      .from('dokumente')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('typ', 'rechnung')

    const nummer = `${jahr}-R-${String((count || 0) + 1).padStart(3, '0')}`

    // Rechnungsdatum + Fälligkeit berechnen
    const heute = new Date()
    const faelligAm = new Date(heute)
    faelligAm.setDate(faelligAm.getDate() + (angebot.zahlungsziel || 14))

    // Rechnung erstellen — alle Daten vom Angebot übernehmen
    const { data: rechnung, error: insertErr } = await (supabaseAdmin as any)
      .from('dokumente')
      .insert({
        user_id:              user.id,
        typ:                  'rechnung',
        status:               'offen',
        nummer,
        kunde_name:           angebot.kunde_name,
        kunde_adresse:        angebot.kunde_adresse,
        positionen:           angebot.positionen,
        netto:                angebot.netto,
        mwst:                 angebot.mwst,
        brutto:               angebot.brutto,
        anmerkungen:          angebot.anmerkungen,
        ausfuehrungszeitraum: angebot.ausfuehrungszeitraum,
        zahlungsziel:         angebot.zahlungsziel || 14,
        gueltig_bis:          faelligAm.toISOString().split('T')[0],
        projekt_id:           angebot.projekt_id,
        token_verbraucht:     TOKEN_KOSTEN.rechnung,
      })
      .select()
      .single()

    if (insertErr) return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 })

    // Angebot auf "angenommen" setzen
    await (supabaseAdmin as any)
      .from('dokumente')
      .update({ status: 'angenommen' })
      .eq('id', angebotId)

    return NextResponse.json({ success: true, data: rechnung })

  } catch (error) {
    console.error('Rechnung erstellen Fehler:', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
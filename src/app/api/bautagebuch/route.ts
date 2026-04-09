import { NextRequest, NextResponse } from 'next/server'
import { anthropic, BAUTAGEBUCH_SYSTEM_PROMPT } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { BautagebuchExtraktion, TOKEN_KOSTEN } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { eingabe, baustelle, wetter, projekt_id, fotos } = await req.json()
    if (!eingabe?.trim()) return NextResponse.json({ error: 'Eingabe fehlt' }, { status: 400 })

    // Token abziehen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenOk } = await (supabaseAdmin as any).rpc('verbrauche_token', {
      p_user_id: user.id, p_anzahl: TOKEN_KOSTEN.bautagebuch, p_beschreibung: 'Bautagebuch Eintrag',
    })
    if (!tokenOk) return NextResponse.json({ error: 'Nicht genug Token' }, { status: 402 })

    // KI
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1024,
      system: BAUTAGEBUCH_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Baustelle: ${baustelle || 'unbekannt'}\nWetter: ${wetter || 'unbekannt'}\n\nEingabe: ${eingabe}` }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let extraktion: BautagebuchExtraktion
    try { extraktion = JSON.parse(cleanJson) }
    catch { return NextResponse.json({ error: 'KI-Fehler' }, { status: 500 }) }

    // Datum DD.MM.YYYY → YYYY-MM-DD
    let datum = new Date().toISOString().split('T')[0]
    if (extraktion.datum) {
      const p = extraktion.datum.split('.')
      if (p.length === 3) datum = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: dbError } = await (supabaseAdmin as any)
      .from('bautagebuch')
      .insert({
        user_id:               user.id,
        baustelle:             baustelle || 'Baustelle',
        datum,
        arbeiter:              extraktion.arbeiter || 1,
        ausgefuehrte_arbeiten: extraktion.ausgefuehrteArbeiten || eingabe,
        lieferungen:           extraktion.lieferungen   || null,
        besuche:               extraktion.besuche       || null,
        besonderheiten:        extraktion.besonderheiten || null,
        wetter:                wetter || extraktion.wetter || null,
        fotos:                 Array.isArray(fotos) && fotos.length > 0 ? fotos : null,
        projekt_id:            projekt_id || null,
        token_verbraucht:      TOKEN_KOSTEN.bautagebuch,
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB Fehler:', dbError)
      return NextResponse.json({ error: 'Speicherfehler' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Bautagebuch Fehler:', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
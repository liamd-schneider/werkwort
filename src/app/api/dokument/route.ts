import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { TOKEN_KOSTEN, DokumentTyp } from '@/types'

// ─── System Prompts pro Typ ──────────────────────────────────────

const PROMPTS: Record<DokumentTyp, string> = {
  angebot: `Du bist ein KI-Assistent der deutschen Handwerksbetrieben hilft, professionelle Angebote zu erstellen.
Extrahiere aus der Eingabe: Kundenname, Adresse, Leistungspositionen mit Mengen und Preisen, Ausführungszeitraum.
Antworte NUR mit validem JSON ohne Markdown:
{
  "kunde": { "name": "string", "adresse": "string" },
  "positionen": [{ "beschreibung": "string", "menge": number, "einheit": "string", "einzelpreis": number, "gesamtpreis": number }],
  "ausfuehrungszeitraum": "string|null",
  "anmerkungen": "string|null"
}
Verwende realistische deutsche Handwerkerpreise. Einheiten: m², Stk., Std., m, pauschal`,

  rechnung: `Du bist ein KI-Assistent der deutschen Handwerksbetrieben hilft, professionelle Rechnungen zu erstellen.
Extrahiere aus der Eingabe: Kundenname, Adresse, erbrachte Leistungen mit Mengen und Preisen, Zahlungsziel.
Antworte NUR mit validem JSON ohne Markdown:
{
  "kunde": { "name": "string", "adresse": "string" },
  "positionen": [{ "beschreibung": "string", "menge": number, "einheit": "string", "einzelpreis": number, "gesamtpreis": number }],
  "zahlungsziel": number,
  "ausfuehrungszeitraum": "string|null",
  "anmerkungen": "string|null"
}
Standard-Zahlungsziel: 14 Tage. Einheiten: m², Stk., Std., m, pauschal`,

  bauvertrag: `Du bist ein KI-Assistent der deutschen Handwerksbetrieben hilft, rechtskonforme Bauverträge zu erstellen.
Erstelle einen VOB/BGB-konformen Bauvertrag mit allen notwendigen Klauseln.
Antworte NUR mit validem JSON ohne Markdown:
{
  "kunde": { "name": "string", "adresse": "string" },
  "positionen": [{ "beschreibung": "string", "menge": number, "einheit": "string", "einzelpreis": number, "gesamtpreis": number }],
  "ausfuehrungszeitraum": "string|null",
  "zahlungsziel": number,
  "gewaehrleistung": "string",
  "besondere_vereinbarungen": "string|null",
  "anmerkungen": "string|null"
}
Gewährleistung Standard: 5 Jahre für Bauwerke (§ 634a BGB). Zahlungsziel: 14 Tage nach Abnahme.`,

  bautagebuch: `Du bist ein KI-Assistent der deutschen Handwerksbetrieben hilft, Bautagebuch-Einträge zu erstellen.
Extrahiere aus der Eingabe einen strukturierten Tagesbericht.
Antworte NUR mit validem JSON ohne Markdown:
{
  "datum": "DD.MM.YYYY",
  "arbeiter": number,
  "ausgefuehrteArbeiten": "string",
  "lieferungen": "string|null",
  "besuche": "string|null",
  "besonderheiten": "string|null",
  "wetter": "string|null"
}`,
}

export async function POST(req: NextRequest) {
  try {
    // ─── 1. Auth ──────────────────────────────────────────
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    // ─── 2. Input ─────────────────────────────────────────
    const { eingabe, typ, baustelle } = await req.json() as {
      eingabe: string
      typ: DokumentTyp
      baustelle?: string
    }

    if (!eingabe?.trim()) return NextResponse.json({ error: 'Bitte beschreibe den Auftrag' }, { status: 400 })
    if (!typ || !PROMPTS[typ]) return NextResponse.json({ error: 'Ungültiger Dokumenttyp' }, { status: 400 })

    // ─── 3. Token abziehen ────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokenErfolg } = await (supabaseAdmin as any).rpc('verbrauche_token', {
      p_user_id: user.id,
      p_anzahl: TOKEN_KOSTEN[typ],
      p_beschreibung: `${typ} erstellt`,
    })
    if (!tokenErfolg) return NextResponse.json({ error: 'Nicht genug Token. Bitte Token kaufen.' }, { status: 402 })

    // ─── 4. Preisliste laden (für Angebot/Rechnung/Bauvertrag) ──
    let preislisteText = ''
    if (typ !== 'bautagebuch') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: preise } = await (supabaseAdmin as any)
        .from('preispositionen')
        .select('*')
        .eq('user_id', user.id)

      if (preise && preise.length > 0) {
        preislisteText = '\n\nPreisliste des Betriebs:\n' +
          preise.map((p: { beschreibung: string; preis: number; einheit: string }) =>
            `- ${p.beschreibung}: ${p.preis}€/${p.einheit}`
          ).join('\n')
      }
    }

    // ─── 5. KI aufrufen ───────────────────────────────────
    const userContent = typ === 'bautagebuch' && baustelle
      ? `Baustelle: ${baustelle}\n\nBeschreibung: ${eingabe}`
      : eingabe

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: PROMPTS[typ] + preislisteText,
      messages: [{ role: 'user', content: userContent }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    // JSON aus Antwort extrahieren (manchmal kommen trotzdem Backticks)
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    let extraktion: any
    try {
      extraktion = JSON.parse(cleanJson)
    } catch {
      console.error('JSON Parse Fehler:', responseText)
      return NextResponse.json({ error: 'KI-Antwort konnte nicht verarbeitet werden' }, { status: 500 })
    }

    // ─── 6. Je nach Typ speichern ─────────────────────────
    if (typ === 'bautagebuch') {
      return await saveBautagebuch(user.id, baustelle || 'Unbekannte Baustelle', extraktion)
    } else {
      return await saveDokument(user.id, typ, extraktion)
    }

  } catch (error) {
    console.error('Dokument API Fehler:', error)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}

// ─── Dokument (Angebot / Rechnung / Bauvertrag) speichern ────────
async function saveDokument(userId: string, typ: DokumentTyp, data: any) {
  const netto  = data.positionen?.reduce((sum: number, p: any) => sum + p.gesamtpreis, 0) || 0
  const mwst   = Math.round(netto * 0.19 * 100) / 100
  const brutto = Math.round((netto + mwst) * 100) / 100

  const jahr = new Date().getFullYear()
  const prefix = typ === 'angebot' ? 'A' : typ === 'rechnung' ? 'R' : 'V'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabaseAdmin as any)
    .from('dokumente')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('typ', typ)

  const nummer = `${jahr}-${prefix}-${String((count || 0) + 1).padStart(3, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dokument, error } = await (supabaseAdmin as any)
    .from('dokumente')
    .insert({
      user_id:              userId,
      typ,
      status:               'entwurf',
      nummer,
      kunde_name:           data.kunde?.name || 'Unbekannt',
      kunde_adresse:        data.kunde?.adresse || '',
      positionen:           data.positionen || [],
      netto,
      mwst,
      brutto,
      anmerkungen:          data.anmerkungen || data.besondere_vereinbarungen || null,
      ausfuehrungszeitraum: data.ausfuehrungszeitraum || null,
      gueltig_bis:          typ === 'angebot'
                              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                              : null,
      zahlungsziel:         data.zahlungsziel || 14,
      token_verbraucht:     TOKEN_KOSTEN[typ],
    })
    .select()
    .single()

  if (error) {
    console.error('DB Fehler:', error)
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: dokument, typ })
}

// ─── Bautagebuch-Eintrag speichern ────────────────────────────────
async function saveBautagebuch(userId: string, baustelle: string, data: any) {
  // Datum parsen (DD.MM.YYYY → YYYY-MM-DD)
  let datum = new Date().toISOString().split('T')[0]
  if (data.datum) {
    const parts = data.datum.split('.')
    if (parts.length === 3) {
      datum = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: eintrag, error } = await (supabaseAdmin as any)
    .from('bautagebuch')
    .insert({
      user_id:               userId,
      baustelle,
      datum,
      arbeiter:              data.arbeiter || 1,
      ausgefuehrte_arbeiten: data.ausgefuehrteArbeiten || data.ausgefuehrte_arbeiten || '',
      lieferungen:           data.lieferungen || null,
      besuche:               data.besuche || null,
      besonderheiten:        data.besonderheiten || null,
      wetter:                data.wetter || null,
      token_verbraucht:      TOKEN_KOSTEN.bautagebuch,
    })
    .select()
    .single()

  if (error) {
    console.error('Bautagebuch DB Fehler:', error)
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data: eintrag, typ: 'bautagebuch' })
}
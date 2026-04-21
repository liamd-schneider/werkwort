import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 })

  const bytes  = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  // MIME-Type mit Fallback über Dateiname
  let mime = file.type || ''
  if (!mime || mime === 'application/octet-stream') {
    const name = file.name.toLowerCase()
    if (name.endsWith('.pdf'))                          mime = 'application/pdf'
    else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mime = 'image/jpeg'
    else if (name.endsWith('.png'))                     mime = 'image/png'
    else if (name.endsWith('.webp'))                    mime = 'image/webp'
    else                                                mime = 'image/jpeg'
  }

  const istBild = mime.startsWith('image/')
  const istPdf  = mime === 'application/pdf'

  if (!istBild && !istPdf) {
    return NextResponse.json(
      { error: 'Bitte ein Bild (JPG, PNG, WEBP) oder PDF hochladen' },
      { status: 400 }
    )
  }

  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          istPdf
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
            : { type: 'image',    source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: base64 } },
          {
            type: 'text',
            text: `Du bist ein Assistent für deutsche Handwerksbetriebe.
Analysiere dieses Dokument (Preisliste, Foto einer Tafel, Tabelle, Angebot o.ä.) und extrahiere alle Preispositionen.

Gib NUR ein JSON-Array zurück, kein anderer Text, keine Erklärung, keine Markdown-Backticks.
Format:
[
  { "beschreibung": "Fliesenlegen", "preis": 45.00, "einheit": "m²" },
  { "beschreibung": "Arbeitsstunde", "preis": 65.00, "einheit": "Std." }
]

Erlaubte Einheiten: "m²", "m", "Stk.", "Std.", "pauschal", "kg", "l"
Wenn keine passende Einheit erkennbar ist, nimm "Stk."
Preise als Dezimalzahl (z.B. 45.00).
Ignoriere MwSt-Angaben — nur Nettopreise.
Wenn du keine Preise erkennst, gib ein leeres Array [] zurück.`,
          },
        ],
      },
    ]

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 2000,
      messages,
    })

    const text = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim() || '[]'

    console.log('[preisliste] mime:', mime, '| base64 bytes:', base64.length, '| claude response:', text.slice(0, 300))

    // JSON sicher parsen
    let positionen: { beschreibung: string; preis: number; einheit: string }[] = []
    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      const parsed  = JSON.parse(cleaned)
      positionen = Array.isArray(parsed) ? parsed : []
    } catch {
      positionen = []
    }

    // Validieren + in DB speichern
    const ERLAUBTE_EINHEITEN = ['m²', 'm', 'Stk.', 'Std.', 'pauschal', 'kg', 'l']
    const gespeichert: any[] = []

    for (const pos of positionen) {
      if (!pos.beschreibung || typeof pos.preis !== 'number' || pos.preis <= 0) continue
      const einheit = ERLAUBTE_EINHEITEN.includes(pos.einheit) ? pos.einheit : 'Stk.'

      const { data } = await (supabaseAdmin as any)
        .from('preispositionen')
        .insert({
          user_id:      user.id,
          beschreibung: String(pos.beschreibung).trim().slice(0, 200),
          preis:        Math.round(pos.preis * 100) / 100,
          einheit,
        })
        .select()
        .single()

      if (data) gespeichert.push(data)
    }

    return NextResponse.json({
      success:     true,
      gefunden:    positionen.length,
      gespeichert: gespeichert.length,
      positionen:  gespeichert,
    })
  } catch (err: any) {
    console.error('[preisliste] Fehler:', err)
    return NextResponse.json(
      { error: err.message || 'KI-Analyse fehlgeschlagen' },
      { status: 500 }
    )
  }
}
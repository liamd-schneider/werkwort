import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ICS Format — RFC 5545
// Funktioniert mit: Google Calendar, Apple Calendar, Outlook, Thunderbird — ohne OAuth

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const typ = searchParams.get('typ') || 'alle' // alle | ausfuehrung | faelligkeit | projekte

    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe').select('name').eq('user_id', user.id).single()

    // Dokumente mit Ausführungszeitraum laden
    const { data: dokumente } = await (supabaseAdmin as any)
      .from('dokumente')
      .select('id,typ,nummer,kunde_name,ausfuehrungszeitraum,gueltig_bis,brutto,status,created_at')
      .eq('user_id', user.id)
      .not('ausfuehrungszeitraum', 'is', null)
      .order('created_at', { ascending: false })

    // Projekte laden
    const { data: projekte } = await (supabaseAdmin as any)
      .from('projekte')
      .select('id,name,kunde_name,status,created_at')
      .eq('user_id', user.id)
      .eq('status', 'aktiv')

    // Bautagebuch-Einträge (letzten 90 Tage)
    const { data: tagebuch } = await (supabaseAdmin as any)
      .from('bautagebuch')
      .select('id,baustelle,datum,arbeiter,ausgefuehrte_arbeiten,wetter')
      .eq('user_id', user.id)
      .gte('datum', new Date(Date.now() - 90*864e5).toISOString().slice(0,10))

    const betriebName = betrieb?.name || 'Werkwort'
    const events: ICSEvent[] = []

    // 1. Ausführungstermine aus Dokumenten
    for (const dok of dokumente || []) {
      if (!dok.ausfuehrungszeitraum) continue

      // Versuche Datum aus Freitext zu parsen
      const parsed = parseDatumAusText(dok.ausfuehrungszeitraum)
      if (!parsed) continue

      events.push({
        uid:         `werkwort-dok-${dok.id}@werkwort.app`,
        summary:     `${dok.typ === 'angebot' ? '📋 Angebot' : '🧾 Auftrag'}: ${dok.kunde_name}`,
        description: `${dok.typ.charAt(0).toUpperCase()+dok.typ.slice(1)} ${dok.nummer}\nKunde: ${dok.kunde_name}\nBetrag: ${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €\nAusführung: ${dok.ausfuehrungszeitraum}`,
        dtstart:     parsed.start,
        dtend:       parsed.end,
        allday:      true,
        status:      dok.status === 'angenommen' ? 'CONFIRMED' : 'TENTATIVE',
        categories:  ['Werkwort', 'Auftrag'],
        url:         `${process.env.NEXT_PUBLIC_APP_URL}/dokumente/${dok.id}`,
      })
    }

    // 2. Zahlungsfristen (Rechnungen fällig)
    const rechnungen = (dokumente || []).filter((d: any) => d.typ === 'rechnung' && d.gueltig_bis && d.status !== 'bezahlt')
    for (const r of rechnungen) {
      const faellig = new Date(r.gueltig_bis)
      events.push({
        uid:         `werkwort-faellig-${r.id}@werkwort.app`,
        summary:     `💰 Fällig: Rechnung ${r.nummer} (${Number(r.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €)`,
        description: `Rechnung ${r.nummer}\nKunde: ${r.kunde_name}\nBetrag: ${Number(r.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €\nStatus: ${r.status}`,
        dtstart:     faellig,
        dtend:       faellig,
        allday:      true,
        status:      'CONFIRMED',
        categories:  ['Werkwort', 'Zahlung'],
        alarm:       { trigger: '-P3D', description: `Rechnung ${r.nummer} wird in 3 Tagen fällig` },
        url:         `${process.env.NEXT_PUBLIC_APP_URL}/dokumente/${r.id}`,
      })
    }

    // 3. Projekte als mehrtägige Ereignisse
    for (const p of projekte || []) {
      const start = new Date(p.created_at)
      const end   = new Date(start)
      end.setMonth(end.getMonth() + 1) // Schätzung: 1 Monat

      events.push({
        uid:         `werkwort-projekt-${p.id}@werkwort.app`,
        summary:     `🏗️ Projekt: ${p.name}`,
        description: `Projekt: ${p.name}\nKunde: ${p.kunde_name}\nStatus: ${p.status}`,
        dtstart:     start,
        dtend:       end,
        allday:      true,
        status:      'CONFIRMED',
        categories:  ['Werkwort', 'Projekt'],
        url:         `${process.env.NEXT_PUBLIC_APP_URL}/projekte/${p.id}`,
      })
    }

    // 4. Bautagebuch-Einträge als vergangene Termine
    for (const e of tagebuch || []) {
      const datum = new Date(e.datum + 'T08:00:00')
      events.push({
        uid:         `werkwort-tag-${e.id}@werkwort.app`,
        summary:     `🔨 Bautagebuch: ${e.baustelle}`,
        description: `Baustelle: ${e.baustelle}\nArbeiter: ${e.arbeiter}\n${e.wetter ? 'Wetter: ' + e.wetter + '\n' : ''}${e.ausgefuehrte_arbeiten}`,
        dtstart:     datum,
        dtend:       new Date(datum.getTime() + 8*3600*1000), // 8h Arbeitstag
        allday:      false,
        status:      'CONFIRMED',
        categories:  ['Werkwort', 'Bautagebuch'],
      })
    }

    const ics = generateICS(events, betriebName)

    return new NextResponse(ics, {
      headers: {
        'Content-Type':        'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="werkwort-${betriebName.replace(/\s/g,'-').toLowerCase()}.ics"`,
        'Cache-Control':       'no-cache',
      },
    })

  } catch (error) {
    console.error('ICS Export Fehler:', error)
    return NextResponse.json({ error: 'Export fehlgeschlagen' }, { status: 500 })
  }
}

// ─── ICS Generierung ────────────────────────────────────────────
interface ICSEvent {
  uid: string; summary: string; description: string
  dtstart: Date; dtend: Date; allday: boolean
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'
  categories: string[]; alarm?: { trigger: string; description: string }
  url?: string
}

function generateICS(events: ICSEvent[], betriebName: string): string {
  const stamp = formatICSDate(new Date(), false)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Werkwort//Werkwort Calendar//DE',
    `X-WR-CALNAME:Werkwort – ${betriebName}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Berlin',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ]

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`SUMMARY:${icsText(event.summary)}`)
    lines.push(`DESCRIPTION:${icsText(event.description)}`)
    lines.push(`STATUS:${event.status}`)
    lines.push(`CATEGORIES:${event.categories.join(',')}`)

    if (event.allday) {
      lines.push(`DTSTART;VALUE=DATE:${formatICSDate(event.dtstart, true)}`)
      lines.push(`DTEND;VALUE=DATE:${formatICSDate(event.dtend, true)}`)
    } else {
      lines.push(`DTSTART;TZID=Europe/Berlin:${formatICSDate(event.dtstart, false)}`)
      lines.push(`DTEND;TZID=Europe/Berlin:${formatICSDate(event.dtend, false)}`)
    }

    if (event.url) lines.push(`URL:${event.url}`)

    if (event.alarm) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`TRIGGER:${event.alarm.trigger}`)
      lines.push(`DESCRIPTION:${icsText(event.alarm.description)}`)
      lines.push('END:VALARM')
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function formatICSDate(d: Date, dateOnly: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`
  if (dateOnly) return date
  return `${date}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function icsText(s: string): string {
  // RFC 5545: Sonderzeichen escapen, Zeilenumbrüche als \n
  return s.replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n')
}

// ─── Hilfsfunktion: Datum aus Freitext parsen ───────────────────
function parseDatumAusText(text: string): { start: Date; end: Date } | null {
  const lower = text.toLowerCase()

  // Monate als Map
  const monate: Record<string, number> = {
    januar:1, jan:1, februar:2, feb:2, märz:3, maerz:3, mar:3,
    april:4, apr:4, mai:5, juni:6, jun:6, juli:7, jul:7,
    august:8, aug:8, september:9, sep:9, oktober:10, okt:10,
    november:11, nov:11, dezember:12, dez:12,
  }

  const jetzt = new Date()
  const jahr  = jetzt.getFullYear()

  // "bis Ende April" / "Ende April"
  const endeMatch = lower.match(/(?:bis\s+)?ende\s+(\w+)(?:\s+(\d{4}))?/)
  if (endeMatch) {
    const monat = monate[endeMatch[1]]
    if (monat) {
      const j  = endeMatch[2] ? parseInt(endeMatch[2]) : jahr
      const start = new Date(j, monat - 1, 1)
      const end   = new Date(j, monat, 0) // letzter Tag des Monats
      return { start, end }
    }
  }

  // "März bis Mai" / "April bis Juni 2026"
  const zeitspanneMatch = lower.match(/(\w+)\s+bis\s+(\w+)(?:\s+(\d{4}))?/)
  if (zeitspanneMatch) {
    const m1 = monate[zeitspanneMatch[1]]
    const m2 = monate[zeitspanneMatch[2]]
    if (m1 && m2) {
      const j     = zeitspanneMatch[3] ? parseInt(zeitspanneMatch[3]) : jahr
      const start = new Date(j, m1 - 1, 1)
      const end   = new Date(j, m2, 0)
      return { start, end }
    }
  }

  // "April 2026" / "im April"
  const monatMatch = lower.match(/(?:im\s+)?(\w+)(?:\s+(\d{4}))?/)
  if (monatMatch) {
    const monat = monate[monatMatch[1]]
    if (monat) {
      const j     = monatMatch[2] ? parseInt(monatMatch[2]) : jahr
      const start = new Date(j, monat - 1, 1)
      const end   = new Date(j, monat, 0)
      return { start, end }
    }
  }

  // "15.04.2026"
  const datumMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (datumMatch) {
    const start = new Date(parseInt(datumMatch[3]), parseInt(datumMatch[2])-1, parseInt(datumMatch[1]))
    const end   = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }

  return null
}
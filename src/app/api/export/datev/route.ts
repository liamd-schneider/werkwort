import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ═══════════════════════════════════════════════════════════════
// DATEV Buchungsstapel Ascii v700
// Spec: DATEV Schnittstellen-Beschreibung 2024
// ═══════════════════════════════════════════════════════════════

// Kontenrahmen-Definitionen
const KONTEN: Record<string, {
  forderungen: string
  bank: string
  erloese19: string
  erloese7: string
  vst19: string
  beschreibung: string
}> = {
  SKR03: {
    forderungen: '1400',
    bank:        '1200',
    erloese19:   '8400',
    erloese7:    '8300',
    vst19:       '1576',
    beschreibung: 'SKR03 (Standard Handwerk)',
  },
  SKR04: {
    forderungen: '1200',
    bank:        '1800',
    erloese19:   '4400',
    erloese7:    '4300',
    vst19:       '1406',
    beschreibung: 'SKR04 (Industriekontenrahmen)',
  },
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const vonDatum       = searchParams.get('von')!
    const bisDatum       = searchParams.get('bis')!
    const kontenrahmen   = (searchParams.get('skr') || 'SKR03') as 'SKR03' | 'SKR04'
    const festschreibung = searchParams.get('fest') === '1' ? '1' : '0'
    const mitZahlungen   = searchParams.get('zahlungen') === '1'
    const nurProtokoll   = searchParams.get('protokoll') === '1'

    if (!vonDatum || !bisDatum) {
      return NextResponse.json({ error: 'Zeitraum fehlt' }, { status: 400 })
    }

    // Betrieb laden
    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe').select('*').eq('user_id', user.id).single()

    // Rechnungen laden
    const { data: rechnungen } = await (supabaseAdmin as any)
      .from('dokumente')
      .select('*')
      .eq('user_id', user.id)
      .in('typ', ['rechnung', 'bauvertrag'])
      .in('status', ['offen', 'bezahlt', 'ueberfaellig', 'angenommen'])
      .gte('created_at', vonDatum + 'T00:00:00')
      .lte('created_at', bisDatum + 'T23:59:59')
      .order('created_at', { ascending: true })

    if (!rechnungen || rechnungen.length === 0) {
      return NextResponse.json({ error: 'Keine Rechnungen im gewählten Zeitraum' }, { status: 404 })
    }

    // Zahlungseingänge (bezahlte Rechnungen) → separate Buchungssätze
    const bezahlteRechnungen = mitZahlungen
      ? rechnungen.filter((r: any) => r.status === 'bezahlt')
      : []

    const konten = KONTEN[kontenrahmen]

    // Übergabeprotokoll als HTML-PDF zurückgeben
    if (nurProtokoll) {
      const html = generateProtokoll(rechnungen, betrieb, vonDatum, bisDatum, kontenrahmen, bezahlteRechnungen)
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    // DATEV CSV generieren
    const csv = generateDatevCSV(
      rechnungen, bezahlteRechnungen, betrieb,
      vonDatum, bisDatum, kontenrahmen, konten, festschreibung
    )

    // Dateiname: DATEV_[Mandant]_[JJJJMM].csv
    const mandantNr = betrieb?.steuernummer?.replace(/\//g, '').slice(0, 5) || '00001'
    const vonJJJJMM = vonDatum.slice(0, 7).replace('-', '')
    const bisJJJJMM = bisDatum.slice(0, 7).replace('-', '')
    const filename  = vonJJJJMM === bisJJJJMM
      ? `DATEV_${mandantNr}_${vonJJJJMM}.csv`
      : `DATEV_${mandantNr}_${vonJJJJMM}_${bisJJJJMM}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-cache',
      },
    })

  } catch (error) {
    console.error('DATEV Export Fehler:', error)
    return NextResponse.json({ error: 'Export fehlgeschlagen' }, { status: 500 })
  }
}

// ─── DATEV CSV Generierung ───────────────────────────────────────
function generateDatevCSV(
  rechnungen: any[],
  zahlungen: any[],
  betrieb: any,
  vonDatum: string,
  bisDatum: string,
  skr: string,
  konten: typeof KONTEN['SKR03'],
  festschreibung: string,
): string {

  const now = new Date()

  // ── Tatsächlichen Datumsbereich aus Buchungen ermitteln ────────
  const alleDaten = rechnungen.map((r: any) => new Date(r.created_at))
  const aelteste  = new Date(Math.min(...alleDaten.map(d => d.getTime())))
  const juengste  = new Date(Math.max(...alleDaten.map(d => d.getTime())))

  // Wirtschaftsjahresbeginn = 1. Januar des ältesten Buchungsjahres
  const wjBeginn = `${aelteste.getFullYear()}0101`

  // Buchungszeitraum dynamisch aus tatsächlichen Buchungen
  const datumVon = formatDatevDate8(aelteste)
  const datumBis = formatDatevDate8(juengste)

  const beraternr = '9999'  // Kann in Einstellungen hinterlegt werden
  const mandantNr = betrieb?.steuernummer?.replace(/\//g, '').slice(0, 5) || '00001'

  // ── Vorlaufsatz ────────────────────────────────────────────────
  const vorlauf = [
    '"EXTF"',        // Kennzeichen Exportformat
    '700',           // Versionsnummer Formatbeschreibung
    '21',            // Datenkategorie 21 = Buchungsstapel
    '"Buchungsstapel"',
    '9',             // Formatversion
    formatTimestamp(now),
    '',              // Reserviert
    '"Werkwort"',    // Herkunft (max. 25 Zeichen)
    '',              // Exportiert von (Benutzername)
    '',              // Importiert von
    beraternr,       // Beraternummer (1-99999)
    mandantNr,       // Mandantennummer (1-99999)
    wjBeginn,        // Wirtschaftsjahresbeginn JJJJMMTT
    '4',             // Sachkontenlänge (4 = Standard)
    datumVon,        // Datum von JJJJMMTT — DYNAMISCH aus Buchungen
    datumBis,        // Datum bis JJJJMMTT — DYNAMISCH aus Buchungen
    `"Werkwort ${vonDatum.slice(0,7)} ${skr}"`, // Bezeichnung
    '',              // Diktatkürzel
    '1',             // Buchungstyp 1 = Finanzbuchführung
    '0',             // Rechnungslegungszweck
    festschreibung,  // Festschreibung: 1 = gesperrt (für DATEV Unternehmen online)
    '"EUR"',         // WKZ
    '',              // Derivatskennzeichen
    '',              // SK-Sachkontennummernlänge
    '',              // Branchen-Lösungs-ID
    '',              // OPOS-Kennzeichen
    '',              // Verarbeitungskennzeichen
    '',              // Anwendungsinformation
  ].join(';')

  // ── Spaltenkopf (Zeile 2) ──────────────────────────────────────
  const kopf = DATEV_SPALTEN.map(s => `"${s}"`).join(';')

  // ── Buchungssätze ──────────────────────────────────────────────
  const buchungen: string[] = []

  // 1. Ausgangsrechnungen: Forderung an Erlöse
  for (const r of rechnungen) {
    const brutto    = formatBetrag(r.brutto)
    const belegdat  = formatBelegdatum(r.created_at)  // TTMM vierstellig
    const belegnr   = sanitizeBelegnr(r.nummer)
    const text      = sanitizeText(`${r.kunde_name} ${r.nummer}`, 60)

    // Steuersatz bestimmen — Standard 19%, 7% falls explizit gesetzt
    const mwstSatz   = bestimmeMwstSatz(r)
    const gegenkonto = mwstSatz === 7 ? konten.erloese7 : konten.erloese19
    const buSchluessel = r.reverse_charge ? '94' : ''  // §13b UStG Reverse Charge

    buchungen.push(buchungssatz({
      umsatz:       brutto,
      shKz:         'S',                  // Soll = Forderung aufbauen
      konto:        konten.forderungen,   // z.B. 1400 (SKR03)
      gegenkonto,                         // z.B. 8400 (SKR03)
      buSchluessel,
      belegdatum:   belegdat,
      belegfeld1:   belegnr,
      buchungstext: text,
    }))
  }

  // 2. Zahlungseingänge: Bank an Forderung (nur wenn aktiviert)
  for (const r of zahlungen) {
    const brutto   = formatBetrag(r.brutto)
    // Zahlungsdatum = updated_at (wenn bezahlt) oder created_at + zahlungsziel
    const zahlDat  = r.updated_at || r.created_at
    const belegdat = formatBelegdatum(zahlDat)
    const belegnr  = sanitizeBelegnr(r.nummer + '-Z')
    const text     = sanitizeText(`Zahlung ${r.kunde_name} ${r.nummer}`, 60)

    buchungen.push(buchungssatz({
      umsatz:       brutto,
      shKz:         'S',                  // Soll = Bank
      konto:        konten.bank,          // z.B. 1200 (SKR03)
      gegenkonto:   konten.forderungen,   // z.B. 1400 (SKR03)
      buSchluessel: '',
      belegdatum:   belegdat,
      belegfeld1:   belegnr,
      buchungstext: text,
    }))
  }

  // BOM für korrekte Zeichenkodierung in Excel/DATEV
  return '\uFEFF' + vorlauf + '\r\n' + kopf + '\r\n' + buchungen.join('\r\n')
}

// ─── Einzelnen Buchungssatz formatieren ─────────────────────────
function buchungssatz(b: {
  umsatz: string; shKz: string; konto: string; gegenkonto: string
  buSchluessel: string; belegdatum: string; belegfeld1: string; buchungstext: string
}): string {
  const felder = [
    b.umsatz,         // Umsatz (ohne SH-Kz)
    b.shKz,           // S oder H
    '"EUR"',          // WKZ
    '',               // Kurs
    '',               // Basis-Umsatz
    '',               // WKZ Basis
    b.konto,          // Konto
    b.gegenkonto,     // Gegenkonto
    b.buSchluessel,   // BU-Schlüssel (leer = auto, 94 = §13b)
    b.belegdatum,     // TTMM
    `"${b.belegfeld1}"`, // Belegfeld 1 (Rechnungsnummer)
    '',               // Belegfeld 2
    '',               // Skonto
    `"${b.buchungstext}"`, // Buchungstext
    ...Array(50).fill(''), // restliche optionale Felder
  ]
  return felder.join(';')
}

// ─── Übergabeprotokoll als HTML ──────────────────────────────────
function generateProtokoll(
  rechnungen: any[], betrieb: any,
  vonDatum: string, bisDatum: string,
  skr: string, zahlungen: any[]
): string {
  const heute      = new Date().toLocaleDateString('de-DE')
  const sumNetto   = rechnungen.reduce((s: number, r: any) => s + Number(r.netto),  0)
  const sumMwst    = rechnungen.reduce((s: number, r: any) => s + Number(r.mwst),   0)
  const sumBrutto  = rechnungen.reduce((s: number, r: any) => s + Number(r.brutto), 0)
  const offene     = rechnungen.filter((r: any) => r.status !== 'bezahlt').length
  const bezahlt    = rechnungen.filter((r: any) => r.status === 'bezahlt').length
  const konten     = KONTEN[skr]

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><title>Übergabeprotokoll</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10pt;color:#1a1a1a;background:#fff;padding:20mm;}
@page{size:A4;margin:20mm;}
@media print{.no-print{display:none!important;}}
.print-bar{background:#0c0c0c;color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;margin:-20mm -20mm 16mm;position:sticky;top:0;}
.print-bar button{background:#d4e840;color:#000;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;}
h1{font-size:16pt;font-weight:700;margin-bottom:2mm;}
h2{font-size:11pt;font-weight:600;margin-bottom:3mm;margin-top:6mm;padding-bottom:2mm;border-bottom:1pt solid #ddd;}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:5mm;}
.meta-box{background:#f9f9f9;border:1pt solid #eee;border-radius:4px;padding:3mm 4mm;}
.meta-label{font-size:8pt;color:#888;margin-bottom:1mm;}
.meta-value{font-size:11pt;font-weight:600;}
table{width:100%;border-collapse:collapse;font-size:9pt;}
thead tr{background:#f0f0f0;border-top:1pt solid #ccc;border-bottom:1pt solid #ccc;}
thead th{padding:2mm 3mm;text-align:left;font-weight:600;}
thead th.r{text-align:right;}
tbody tr{border-bottom:.5pt solid #eee;}
tbody td{padding:2mm 3mm;}
tbody td.r{text-align:right;font-variant-numeric:tabular-nums;}
.summe-row{background:#f9f9f9;font-weight:700;border-top:1.5pt solid #333;}
.konto-box{background:#f0f8f0;border:1pt solid #9fd09f;border-radius:4px;padding:4mm;margin-top:4mm;font-size:9pt;}
.warn-box{background:#fff8e8;border:1pt solid #f0c060;border-radius:4px;padding:3mm 4mm;margin-top:3mm;font-size:9pt;}
.footer{margin-top:8mm;padding-top:4mm;border-top:.5pt solid #ddd;font-size:8pt;color:#aaa;}
</style>
</head>
<body>
<div class="print-bar no-print">
  <span>Übergabeprotokoll — ${betrieb?.name || ''}</span>
  <button onclick="window.print()">Drucken / PDF</button>
</div>

<h1>DATEV-Übergabeprotokoll</h1>
<p style="color:#888;font-size:9pt;margin-bottom:6mm">Erstellt am ${heute} · ${skr} · Werkwort</p>

<div class="meta">
  <div class="meta-box"><div class="meta-label">Mandant</div><div class="meta-value">${betrieb?.name || '—'}</div></div>
  <div class="meta-box"><div class="meta-label">Steuernummer</div><div class="meta-value">${betrieb?.steuernummer || '—'}</div></div>
  <div class="meta-box"><div class="meta-label">Zeitraum</div><div class="meta-value">${new Date(vonDatum).toLocaleDateString('de-DE')} – ${new Date(bisDatum).toLocaleDateString('de-DE')}</div></div>
  <div class="meta-box"><div class="meta-label">Kontenrahmen</div><div class="meta-value">${skr} — ${KONTEN[skr].beschreibung}</div></div>
</div>

<h2>Zusammenfassung</h2>
<div class="meta">
  <div class="meta-box"><div class="meta-label">Buchungen gesamt</div><div class="meta-value">${rechnungen.length}</div></div>
  <div class="meta-box"><div class="meta-label">davon bezahlt / offen</div><div class="meta-value">${bezahlt} / ${offene}</div></div>
  <div class="meta-box"><div class="meta-label">Nettoumsatz gesamt</div><div class="meta-value">${sumNetto.toLocaleString('de-DE',{minimumFractionDigits:2})} €</div></div>
  <div class="meta-box"><div class="meta-label">USt 19% gesamt</div><div class="meta-value">${sumMwst.toLocaleString('de-DE',{minimumFractionDigits:2})} €</div></div>
  <div class="meta-box" style="grid-column:1/-1"><div class="meta-label">Bruttoumsatz gesamt</div><div class="meta-value" style="font-size:15pt">${sumBrutto.toLocaleString('de-DE',{minimumFractionDigits:2})} €</div></div>
</div>

<div class="konto-box">
  <strong>Verwendete Konten (${skr})</strong><br>
  Forderungen: ${konten.forderungen} &nbsp;·&nbsp; Erlöse 19% USt: ${konten.erloese19} &nbsp;·&nbsp; Erlöse 7% USt: ${konten.erloese7} &nbsp;·&nbsp; Bank/Kasse: ${konten.bank}
</div>

${zahlungen.length > 0 ? `
<div class="konto-box" style="background:#e8f4ff;border-color:#6ab0e0;margin-top:2mm">
  <strong>Zahlungseingänge enthalten:</strong> ${zahlungen.length} Zahlungsbuchungen (${konten.bank} an ${konten.forderungen})
</div>` : ''}

<h2>Enthaltene Rechnungen</h2>
<table>
  <thead><tr>
    <th>Nr.</th><th>Datum</th><th>Kunde</th><th class="r">Netto</th><th class="r">USt 19%</th><th class="r">Brutto</th><th>Status</th>
  </tr></thead>
  <tbody>
    ${rechnungen.map((r: any) => `
    <tr>
      <td style="font-family:monospace">${r.nummer}</td>
      <td>${new Date(r.created_at).toLocaleDateString('de-DE')}</td>
      <td>${r.kunde_name}</td>
      <td class="r">${Number(r.netto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      <td class="r">${Number(r.mwst).toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      <td class="r">${Number(r.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      <td>${{offen:'Offen',bezahlt:'Bezahlt',ueberfaellig:'Überfällig',angenommen:'Angenommen'}[r.status as string]||r.status}</td>
    </tr>`).join('')}
    <tr class="summe-row">
      <td colspan="3">Gesamt (${rechnungen.length} Buchungen)</td>
      <td class="r">${sumNetto.toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      <td class="r">${sumMwst.toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      <td class="r">${sumBrutto.toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="warn-box">
  <strong>Hinweis für den Steuerberater:</strong> Dieser Export wurde mit Werkwort erstellt und enthält Ausgangsrechnungen im DATEV Buchungsstapel Format (Ascii v700). Bitte prüfen Sie die Kontonummern auf Übereinstimmung mit dem Kontenrahmen des Mandanten vor dem Import.
</div>

<div class="footer">
  ${betrieb?.name||''} · ${betrieb?.adresse||''} · ${betrieb?.steuernummer ? 'Steuernr.: ' + betrieb.steuernummer : ''} · Erstellt mit Werkwort
</div>
</body></html>`
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────

function formatBetrag(n: number | string): string {
  return Math.abs(Number(n)).toFixed(2).replace('.', ',')
}

// Belegdatum: immer TTMM — vierstellig, kein Jahr, keine Striche
function formatBelegdatum(dateStr: string): string {
  const d = new Date(dateStr)
  const tt = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${tt}${mm}`  // z.B. "0104" für 1. April
}

// Datum 8-stellig für Vorlaufsatz JJJJMMTT
function formatDatevDate8(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const tt = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}${mm}${tt}`
}

function formatTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}000`
}

function sanitizeBelegnr(s: string): string {
  return s.replace(/[^A-Za-z0-9\-_]/g, '').slice(0, 12)
}

function sanitizeText(s: string, maxLen: number): string {
  return s.replace(/[";]/g, ' ').slice(0, maxLen)
}

function bestimmeMwstSatz(r: any): number {
  // Standard: 19%. In Zukunft: Feld in Dokument für abweichenden Satz
  return r.mwst_satz || 19
}

// Alle 64 DATEV-Spalten (Buchungsstapel v700)
const DATEV_SPALTEN = [
  'Umsatz (ohne Soll/Haben-Kz)','Soll/Haben-Kennzeichen','WKZ Umsatz','Kurs',
  'Basis-Umsatz','WKZ Basis-Umsatz','Konto','Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel','Belegdatum','Belegfeld 1','Belegfeld 2','Skonto','Buchungstext',
  'Postensperre','Diverse Adressnummer','Geschäftspartnerbank','Sachverhalt',
  'Zinssperre','Beleglink','Beleginfo - Art 1','Beleginfo - Inhalt 1',
  'Beleginfo - Art 2','Beleginfo - Inhalt 2','Beleginfo - Art 3','Beleginfo - Inhalt 3',
  'Beleginfo - Art 4','Beleginfo - Inhalt 4','Beleginfo - Art 5','Beleginfo - Inhalt 5',
  'Beleginfo - Art 6','Beleginfo - Inhalt 6','Beleginfo - Art 7','Beleginfo - Inhalt 7',
  'Beleginfo - Art 8','Beleginfo - Inhalt 8','KOST1 - Kostenstelle','KOST2 - Kostenstelle',
  'KOST-Menge','EU-Land u. UStID','EU-Steuersatz','Abw. Versteuerungsart',
  'Sachverhalt L+L','Funktionsergänzung L+L','BU 49 Hauptfunktionstyp',
  'BU 49 Hauptfunktionsnummer','BU 49 Funktionsergänzung',
  'Zusatzinformation - Art 1','Zusatzinformation - Inhalt 1',
  'Zusatzinformation - Art 2','Zusatzinformation - Inhalt 2',
  'Stück','Gewicht','Zahlweise','Forderungsart','Veranlagungsjahr',
  'Zugeordnete Fälligkeit','Skontotyp','Auftragsnummer','Land',
  'Abrechnungsreferenz','BVV-Position',
  'EU-Mitgliedstaat u. UStID Ursprung','EU-Steuersatz Ursprung',
]
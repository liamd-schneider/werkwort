import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const dokumentId = searchParams.get('id')
    const isPublic   = searchParams.get('public') === '1'

    if (!dokumentId) return NextResponse.json({ error: 'ID fehlt' }, { status: 400 })

    let userId: string | null = null

    if (!isPublic) {
      const authHeader = req.headers.get('authorization')
      if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabaseAdmin.auth.getUser(token)
      if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
      userId = user.id
    }

    // Dokument laden
    const query = (supabaseAdmin as any).from('dokumente').select('*').eq('id', dokumentId)
    if (userId) query.eq('user_id', userId)
    const { data: dok } = await query.single()
    if (!dok) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    // Betrieb MIT Design-Einstellungen laden
    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe')
      .select('name,adresse,telefon,email,steuernummer,iban,logo_url,farbe_primary,farbe_accent,schriftart,formular_stil,fusszeile,website')
      .eq('user_id', dok.user_id)
      .single()

    const html = generatePDF(dok, betrieb)

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })

  } catch (error) {
    console.error('PDF Fehler:', error)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

// ─── Design-Variablen aus Betrieb ───────────────────────────────
function getDesign(betrieb: any) {
  const primary  = betrieb?.farbe_primary || '#0c0c0c'
  const accent   = betrieb?.farbe_accent  || '#d4e840'
  const stil     = betrieb?.formular_stil || 'modern'
  const schrift  = betrieb?.schriftart    || 'helvetica'

  // Schriftart-Stack
  const fontStack =
    schrift === 'georgia'  ? "Georgia, 'Times New Roman', serif"    :
    schrift === 'courier'  ? "'Courier New', Courier, monospace"     :
    schrift === 'arial'    ? "Arial, Helvetica, sans-serif"          :
                             "'Helvetica Neue', Arial, sans-serif"

  // Stil-spezifische Eigenschaften
  const istModern    = stil === 'modern'
  const istKlassisch = stil === 'klassisch'
  const istBold      = stil === 'bold'

  return {
    primary, accent, fontStack, stil,
    // Header-Design
    headerBg:        istBold      ? primary          : istKlassisch ? '#f9f9f9' : '#ffffff',
    headerColor:     istBold      ? '#ffffff'         : primary,
    headerBorder:    istKlassisch ? `2px solid ${primary}` : istModern ? `1px solid #eee` : `3px solid ${accent}`,
    // Dokumenttyp-Label
    typColor:        istBold      ? accent            : istKlassisch ? primary : accent,
    typSize:         istBold      ? '22pt'            : '18pt',
    typWeight:       '800',
    // Tabellen-Header
    tableHeadBg:     istBold      ? primary           : istKlassisch ? '#efefef' : '#f5f5f5',
    tableHeadColor:  istBold      ? '#ffffff'         : '#333',
    // Trennlinie Briefkopf
    dividerColor:    accent,
    dividerHeight:   istBold      ? '3px'             : istKlassisch ? '2px' : '1px',
    // Summen-Block
    totalBg:         istBold      ? primary + '08'   : '#f9f9f9',
    totalBorder:     `1.5pt solid ${primary}`,
    // Akzent-Balken links (bei Modern)
    accentBar:       istModern,
  }
}

function generatePDF(dok: any, betrieb: any) {
  const pos       = dok.positionen || []
  const heute     = new Date().toLocaleDateString('de-DE')
  const isRech    = dok.typ === 'rechnung'
  const isAngebot = dok.typ === 'angebot'
  const isVertrag = dok.typ === 'bauvertrag'
  const typLabel  = isRech ? 'RECHNUNG' : isAngebot ? 'ANGEBOT' : isVertrag ? 'BAUVERTRAG' : dok.typ.toUpperCase()
  const faelligAm = dok.gueltig_bis ? new Date(dok.gueltig_bis).toLocaleDateString('de-DE') : null

  const d = getDesign(betrieb)

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${typLabel} ${dok.nummer}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{
  font-family:${d.fontStack};
  font-size:10pt;
  color:#1a1a1a;
  background:#fff;
  line-height:1.45;
}
@page{size:A4;margin:20mm 20mm 28mm 25mm;}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .no-print{display:none!important;}
}

/* Print-Bar */
.print-bar{
  background:#0c0c0c;color:#fff;padding:11px 24px;
  display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:100;
}
.print-bar span{font-size:13px;}
.print-bar button{
  background:${d.accent};color:${d.accent === '#ffffff' ? '#000' : '#000'};
  border:none;padding:8px 20px;border-radius:6px;
  font-size:13px;font-weight:600;cursor:pointer;
  font-family:${d.fontStack};
}

/* Seite */
.page{
  max-width:210mm;min-height:297mm;
  margin:20px auto;
  padding:18mm 20mm 28mm 25mm;
  background:#fff;
  box-shadow:0 0 24px rgba(0,0,0,.1);
}

/* Briefkopf */
.header{
  display:flex;justify-content:space-between;align-items:flex-start;
  margin-bottom:7mm;padding-bottom:5mm;
  border-bottom:${d.dividerHeight} solid ${d.dividerColor};
  ${d.stil === 'bold' ? `background:${d.headerBg};padding:6mm;margin:-0mm;border-radius:4px 4px 0 0;` : ''}
}
.logo-block{}
.logo-img{max-height:48px;max-width:160px;object-fit:contain;margin-bottom:5px;}
.firmenname{
  font-size:13pt;font-weight:700;
  color:${d.headerColor};
  ${d.stil === 'bold' ? 'color:#ffffff;' : ''}
}
.firma-details{
  font-size:8.5pt;
  color:${d.stil === 'bold' ? 'rgba(255,255,255,0.75)' : '#666'};
  line-height:1.65;margin-top:2px;
}
.dok-block{text-align:right;}
.dok-typ{
  font-size:${d.typSize};font-weight:${d.typWeight};
  color:${d.stil === 'bold' ? d.accent : d.typColor};
  letter-spacing:-0.5px;
}
.dok-nr{font-size:9pt;color:${d.stil === 'bold' ? 'rgba(255,255,255,0.6)' : '#999'};margin-top:2px;}
.dok-datum{font-size:9pt;color:${d.stil === 'bold' ? 'rgba(255,255,255,0.6)' : '#666'};margin-top:1px;}

/* Absender klein */
.absender-klein{
  font-size:7pt;color:#999;
  padding-bottom:2mm;margin-bottom:2.5mm;
  border-bottom:.5pt solid #ddd;
}

/* Empfänger */
.empfaenger-block{margin-bottom:7mm;}
.empfaenger-name{font-size:11pt;font-weight:600;}
.empfaenger-adresse{font-size:10pt;color:#444;line-height:1.6;}

/* Betreff */
.betreff{
  font-size:11pt;font-weight:700;
  margin:4mm 0 3mm;
  color:${d.primary};
  ${d.accentBar ? `border-left:3px solid ${d.accent};padding-left:8px;` : ''}
}

/* Meta-Zeile */
.meta-row{
  display:flex;gap:14mm;flex-wrap:wrap;
  font-size:9pt;color:#555;
  padding:2.5mm 0;
  border-top:.5pt solid #eee;
  border-bottom:.5pt solid #eee;
  margin-bottom:5mm;
}
.meta-item label{font-weight:600;color:#333;display:block;font-size:8pt;margin-bottom:1px;}

/* Positions-Tabelle */
table{width:100%;border-collapse:collapse;margin-bottom:3mm;font-size:9.5pt;}
thead tr{
  background:${d.tableHeadBg};
  border-top:1pt solid ${d.dividerColor};
  border-bottom:1pt solid ${d.dividerColor};
}
thead th{
  padding:2.5mm 3mm;font-weight:600;font-size:8.5pt;
  color:${d.tableHeadColor};text-align:left;
}
thead th.r{text-align:right;}
tbody tr{border-bottom:.5pt solid #f0f0f0;}
tbody tr:hover{}
tbody td{padding:2.5mm 3mm;vertical-align:top;}
tbody td.r{text-align:right;font-variant-numeric:tabular-nums;}
tbody td.c{text-align:center;}
.pos-nr{color:#aaa;font-size:8.5pt;width:8mm;}

/* Summen */
.summen-wrap{display:flex;justify-content:flex-end;margin-top:1mm;}
.summen{
  width:72mm;
  background:${d.totalBg};
  border-radius:4px;
  padding:3mm 4mm;
}
.summen-row{
  display:flex;justify-content:space-between;
  padding:1.5mm 0;font-size:9.5pt;color:#555;
}
.summen-row.gesamt{
  font-weight:800;font-size:12pt;color:#1a1a1a;
  border-top:${d.totalBorder};
  margin-top:1.5mm;padding-top:2mm;
}

/* Zahlungsinfo */
.zahlungsinfo{
  margin-top:7mm;padding-top:4mm;
  border-top:.5pt solid #eee;
  font-size:9pt;color:#555;line-height:1.65;
}
.zahlungsinfo strong{color:#1a1a1a;}

/* Akzent-Box für Hinweise */
.hinweis-box{
  margin-top:4mm;
  padding:3mm 4mm;
  background:${d.accent}18;
  border-left:2.5pt solid ${d.accent};
  border-radius:0 4px 4px 0;
  font-size:9pt;color:#444;
}

/* Bauvertrag Klauseln */
.klausel{margin-top:4.5mm;}
.klausel h3{font-size:10pt;font-weight:700;color:${d.primary};margin-bottom:1.5mm;}
.klausel p{font-size:9pt;color:#444;line-height:1.65;}

.unterschrift-bereich{display:flex;gap:20mm;margin-top:14mm;}
.unterschrift-box{
  flex:1;padding-top:2mm;font-size:8.5pt;color:#555;
  border-top:1pt solid #333;
}

/* Footer */
.footer{
  margin-top:9mm;padding-top:3.5mm;
  border-top:.5pt solid #ddd;
  font-size:7.5pt;color:#aaa;
  display:flex;justify-content:space-between;flex-wrap:wrap;gap:3mm;
}
.footer strong{color:#888;}
</style>
</head>
<body>

<div class="print-bar no-print">
  <span>${typLabel} ${dok.nummer} — ${dok.kunde_name}</span>
  <button onclick="window.print()">Als PDF speichern / Drucken</button>
</div>

<div class="page">

  <!-- BRIEFKOPF -->
  <div class="header">
    <div class="logo-block">
      ${betrieb?.logo_url ? `<img src="${betrieb.logo_url}" alt="Logo" class="logo-img">` : ''}
      <div class="firmenname">${betrieb?.name || 'Firmenname'}</div>
      <div class="firma-details">
        ${betrieb?.adresse ? betrieb.adresse + '<br>' : ''}
        ${betrieb?.telefon ? 'Tel: ' + betrieb.telefon : ''}${betrieb?.telefon && betrieb?.email ? ' &nbsp;·&nbsp; ' : ''}${betrieb?.email ? betrieb.email : ''}${(betrieb?.telefon || betrieb?.email) ? '<br>' : ''}
        ${betrieb?.steuernummer ? 'Steuernr.: ' + betrieb.steuernummer : ''}
        ${betrieb?.website ? (betrieb?.steuernummer ? ' &nbsp;·&nbsp; ' : '') + betrieb.website : ''}
      </div>
    </div>
    <div class="dok-block">
      <div class="dok-typ">${typLabel}</div>
      <div class="dok-nr">Nr. ${dok.nummer}</div>
      <div class="dok-datum">Datum: ${heute}</div>
    </div>
  </div>

  <!-- EMPFÄNGER -->
  <div class="empfaenger-block">
    <div class="absender-klein">${betrieb?.name || ''} &nbsp;·&nbsp; ${betrieb?.adresse || ''}</div>
    <div class="empfaenger-name">${dok.kunde_name}</div>
    <div class="empfaenger-adresse">${(dok.kunde_adresse || '').replace(/,\s*/g, '<br>')}</div>
  </div>

  <!-- BETREFF -->
  <div class="betreff">
    ${isRech ? 'Rechnung für erbrachte Leistungen' : isAngebot ? 'Angebot für Ihre Anfrage' : 'Bauvertrag'}
  </div>

  <!-- META -->
  <div class="meta-row">
    <div class="meta-item"><label>Datum</label>${heute}</div>
    ${isRech    && faelligAm ? `<div class="meta-item"><label>Zahlbar bis</label>${faelligAm}</div>` : ''}
    ${isAngebot && faelligAm ? `<div class="meta-item"><label>Gültig bis</label>${faelligAm}</div>` : ''}
    ${dok.ausfuehrungszeitraum ? `<div class="meta-item"><label>Ausführung</label>${dok.ausfuehrungszeitraum}</div>` : ''}
    ${isRech && dok.zahlungsziel ? `<div class="meta-item"><label>Zahlungsziel</label>${dok.zahlungsziel} Tage</div>` : ''}
  </div>

  <!-- POSITIONEN -->
  <table>
    <thead><tr>
      <th class="pos-nr" style="width:8mm">Pos.</th>
      <th>Beschreibung</th>
      <th class="r" style="width:18mm">Menge</th>
      <th class="r" style="width:22mm">Einzelpreis</th>
      <th class="r" style="width:24mm">Gesamtpreis</th>
    </tr></thead>
    <tbody>
      ${pos.map((p: any, i: number) => `
      <tr>
        <td class="c pos-nr">${i+1}</td>
        <td>${p.beschreibung}</td>
        <td class="r">${p.menge} ${p.einheit}</td>
        <td class="r">${Number(p.einzelpreis).toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
        <td class="r">${Number(p.gesamtpreis).toLocaleString('de-DE',{minimumFractionDigits:2})} €</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- SUMMEN -->
  <div class="summen-wrap">
    <div class="summen">
      <div class="summen-row"><span>Nettobetrag</span><span>${Number(dok.netto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</span></div>
      <div class="summen-row"><span>Umsatzsteuer 19 %</span><span>${Number(dok.mwst).toLocaleString('de-DE',{minimumFractionDigits:2})} €</span></div>
      <div class="summen-row gesamt"><span>Gesamtbetrag</span><span>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</span></div>
    </div>
  </div>

  <!-- HINWEIS (nur wenn vorhanden und relevant) -->
  ${dok.anmerkungen && dok.anmerkungen.trim() ? `
  <div class="hinweis-box">
    <strong>Hinweis:</strong> ${dok.anmerkungen}
  </div>` : ''}

  <!-- ZAHLUNGSINFOS -->
  ${isRech ? `
  <div class="zahlungsinfo">
    <p>Bitte überweisen Sie <strong>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</strong>
    ${faelligAm ? `bis zum <strong>${faelligAm}</strong>` : `innerhalb von ${dok.zahlungsziel||14} Tagen`}
    auf folgendes Konto:</p>
    ${betrieb?.iban ? `<p style="margin-top:2mm"><strong>IBAN:</strong> ${betrieb.iban}</p>` : ''}
    <p style="margin-top:1.5mm">Verwendungszweck: <strong>${dok.nummer}</strong></p>
  </div>` : ''}

  ${isAngebot ? `
  <div class="zahlungsinfo">
    <p>Dieses Angebot ist freibleibend${faelligAm ? ` und gültig bis <strong>${faelligAm}</strong>` : ''}.
    Bei Auftragserteilung gelten unsere allgemeinen Geschäftsbedingungen.</p>
  </div>` : ''}

  <!-- BAUVERTRAG KLAUSELN -->
  ${isVertrag ? `
  <div class="klausel"><h3>§ 1 Vertragsgegenstand</h3>
  <p>Der Auftragnehmer verpflichtet sich zur Ausführung der oben aufgeführten Leistungen am angegebenen Objekt gemäß den anerkannten Regeln der Technik und den Bestimmungen dieses Vertrages.</p></div>
  <div class="klausel"><h3>§ 2 Vergütung und Zahlungsbedingungen</h3>
  <p>Die vereinbarte Vergütung beträgt <strong>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} € (inkl. 19 % USt.)</strong>.
  Schlusszahlung ${dok.zahlungsziel||14} Tage nach Abnahme und Rechnungsstellung.
  ${betrieb?.iban ? `IBAN: ${betrieb.iban}` : ''}</p></div>
  <div class="klausel"><h3>§ 3 Ausführungsfristen</h3>
  <p>${dok.ausfuehrungszeitraum ? `Ausführungszeitraum: ${dok.ausfuehrungszeitraum}. ` : ''}Der Beginn setzt voraus, dass alle notwendigen Vorleistungen des Auftraggebers erbracht sind.</p></div>
  <div class="klausel"><h3>§ 4 Gewährleistung</h3>
  <p>Die Gewährleistungsfrist beträgt 5 Jahre ab Abnahme (§ 634a Abs. 1 Nr. 2 BGB). Der Auftragnehmer ist zur Nacherfüllung berechtigt und verpflichtet.</p></div>
  <div class="klausel"><h3>§ 5 Datenschutz</h3>
  <p>Die im Rahmen dieses Vertrages erhobenen personenbezogenen Daten werden ausschließlich zur Vertragserfüllung verarbeitet und nicht an Dritte weitergegeben (Art. 6 Abs. 1 lit. b DSGVO).</p></div>
  <div class="unterschrift-bereich">
    <div class="unterschrift-box">Ort, Datum &nbsp;·&nbsp; Auftraggeber<br><br><br>___________________________<br>${dok.kunde_name}</div>
    <div class="unterschrift-box">Ort, Datum &nbsp;·&nbsp; Auftragnehmer<br><br><br>___________________________<br>${betrieb?.name||''}</div>
  </div>` : ''}

  <!-- FOOTER DSGVO-KONFORM -->
  <div class="footer">
    <div>
      <strong>${betrieb?.name||''}</strong><br>
      ${betrieb?.adresse||''}
      ${betrieb?.steuernummer ? '<br>Steuernr.: ' + betrieb.steuernummer : ''}
    </div>
    ${betrieb?.iban ? `<div><strong>Bankverbindung</strong><br>IBAN: ${betrieb.iban}</div>` : ''}
    <div>
      ${betrieb?.telefon ? 'Tel: ' + betrieb.telefon + '<br>' : ''}
      ${betrieb?.email   ? betrieb.email + '<br>' : ''}
      ${betrieb?.website ? betrieb.website : ''}
    </div>
    ${betrieb?.fusszeile ? `<div style="width:100%;color:#bbb;font-size:7pt;border-top:.5pt solid #eee;padding-top:2mm;margin-top:1mm;">${betrieb.fusszeile}</div>` : ''}
  </div>

</div>

<script>
  if (window.location.search.includes('print=1')) {
    window.addEventListener('load', () => setTimeout(() => window.print(), 600))
  }
</script>
</body>
</html>`
}
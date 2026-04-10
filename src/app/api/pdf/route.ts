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

    const query = (supabaseAdmin as any).from('dokumente').select('*').eq('id', dokumentId)
    if (userId) query.eq('user_id', userId)
    const { data: dok } = await query.single()
    if (!dok) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe').select('*').eq('user_id', dok.user_id).single()

    // Stripe-Zahlungslink laden falls Rechnung
    let zahlungslink: string | null = dok.zahlungslink || null
    if (!zahlungslink && dok.typ === 'rechnung' && dok.status !== 'bezahlt') {
      // Stripe Account prüfen
      const { data: anbieter } = await (supabaseAdmin as any)
        .from('zahlungsanbieter')
        .select('stripe_account_id,stripe_charges_enabled')
        .eq('user_id', dok.user_id)
        .eq('provider', 'stripe')
        .single()

      if (anbieter?.stripe_charges_enabled) {
        // Payment Link on-the-fly erstellen
        try {
          const Stripe = (await import('stripe')).default
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
          const session = await stripe.checkout.sessions.create(
            {
              mode: 'payment',
              payment_method_types: ['card', 'sepa_debit'],
              line_items: [{
                price_data: {
                  currency:     'eur',
                  unit_amount:  Math.round(dok.brutto * 100),
                  product_data: { name: `Rechnung ${dok.nummer}` },
                },
                quantity: 1,
              }],
              metadata: { dokument_id: dokumentId, user_id: dok.user_id, rechnung_nr: dok.nummer },
              success_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/zahlung/bestaetigung?session={CHECKOUT_SESSION_ID}&dok=${dokumentId}`,
              cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/zahlung/fehler`,
            },
            { stripeAccount: anbieter.stripe_account_id }
          )
          zahlungslink = session.url
          // Link speichern
          await (supabaseAdmin as any).from('dokumente').update({
            zahlungslink: session.url, zahlungsanbieter: 'stripe', zahlung_session_id: session.id,
          }).eq('id', dokumentId)
        } catch (err) {
          console.error('Payment Link Fehler:', err)
        }
      }
    }

    const html = generatePDF(dok, betrieb, zahlungslink)
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })

  } catch (error) {
    console.error('PDF Fehler:', error)
    return NextResponse.json({ error: 'Fehler' }, { status: 500 })
  }
}

function getDesign(betrieb: any) {
  const primary  = betrieb?.farbe_primary || '#0c0c0c'
  const accent   = betrieb?.farbe_accent  || '#d4e840'
  const stil     = betrieb?.formular_stil || 'modern'
  const schrift  = betrieb?.schriftart    || 'helvetica'
  const fontStack =
    schrift === 'georgia' ? "Georgia,'Times New Roman',serif"  :
    schrift === 'courier' ? "'Courier New',Courier,monospace"  :
    schrift === 'arial'   ? "Arial,Helvetica,sans-serif"        :
                            "'Helvetica Neue',Arial,sans-serif"
  const istBold      = stil === 'bold'
  const istKlassisch = stil === 'klassisch'
  return {
    primary, accent, fontStack, stil,
    headerBg:       istBold ? primary : '#ffffff',
    headerColor:    istBold ? '#ffffff' : primary,
    typColor:       accent,
    typSize:        istBold ? '22pt' : '18pt',
    tableHeadBg:    istBold ? primary : istKlassisch ? '#efefef' : '#f5f5f5',
    tableHeadColor: istBold ? '#ffffff' : '#333',
    dividerColor:   accent,
    dividerHeight:  istBold ? '3px' : istKlassisch ? '2px' : '1px',
    totalBg:        '#f9f9f9',
    accentBar:      stil === 'modern',
  }
}

function generatePDF(dok: any, betrieb: any, zahlungslink: string | null) {
  const pos       = dok.positionen || []
  const heute     = new Date().toLocaleDateString('de-DE')
  const isRech    = dok.typ === 'rechnung'
  const isAngebot = dok.typ === 'angebot'
  const isVertrag = dok.typ === 'bauvertrag'
  const typLabel  = isRech ? 'RECHNUNG' : isAngebot ? 'ANGEBOT' : isVertrag ? 'BAUVERTRAG' : dok.typ.toUpperCase()
  const faelligAm = dok.gueltig_bis ? new Date(dok.gueltig_bis).toLocaleDateString('de-DE') : null
  const d         = getDesign(betrieb)

  // QR-Code URL via Google Charts API (kein npm, funktioniert überall)
  const qrUrl = zahlungslink
    ? `https://chart.googleapis.com/chart?chs=140x140&cht=qr&chl=${encodeURIComponent(zahlungslink)}&choe=UTF-8`
    : null

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${typLabel} ${dok.nummer}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:${d.fontStack};font-size:10pt;color:#1a1a1a;background:#fff;line-height:1.45;}
@page{size:A4;margin:20mm 20mm 28mm 25mm;}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none!important;}}

.print-bar{background:#0c0c0c;color:#fff;padding:11px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
.print-bar button{background:${d.accent};color:#000;border:none;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;}

.page{max-width:210mm;min-height:297mm;margin:20px auto;padding:18mm 20mm 28mm 25mm;background:#fff;box-shadow:0 0 24px rgba(0,0,0,.1);}

.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7mm;padding-bottom:5mm;border-bottom:${d.dividerHeight} solid ${d.dividerColor};}
.logo-img{max-height:48px;max-width:160px;object-fit:contain;margin-bottom:5px;}
.firmenname{font-size:13pt;font-weight:700;color:${d.headerColor};}
.firma-details{font-size:8.5pt;color:#666;line-height:1.65;margin-top:2px;}
.dok-typ{font-size:${d.typSize};font-weight:800;color:${d.typColor};letter-spacing:-0.5px;text-align:right;}
.dok-nr{font-size:9pt;color:#999;margin-top:2px;text-align:right;}
.dok-datum{font-size:9pt;color:#666;margin-top:1px;text-align:right;}

.absender-klein{font-size:7pt;color:#999;padding-bottom:2mm;margin-bottom:2.5mm;border-bottom:.5pt solid #ddd;}
.empfaenger-block{margin-bottom:7mm;}
.empfaenger-name{font-size:11pt;font-weight:600;}
.empfaenger-adresse{font-size:10pt;color:#444;line-height:1.6;}

.betreff{font-size:11pt;font-weight:700;margin:4mm 0 3mm;color:${d.primary};${d.accentBar?`border-left:3px solid ${d.accent};padding-left:8px;border-radius:0;`:''}}

.meta-row{display:flex;gap:14mm;flex-wrap:wrap;font-size:9pt;color:#555;padding:2.5mm 0;border-top:.5pt solid #eee;border-bottom:.5pt solid #eee;margin-bottom:5mm;}
.meta-item label{font-weight:600;color:#333;display:block;font-size:8pt;margin-bottom:1px;}

table{width:100%;border-collapse:collapse;margin-bottom:3mm;font-size:9.5pt;}
thead tr{background:${d.tableHeadBg};border-top:1pt solid ${d.dividerColor};border-bottom:1pt solid ${d.dividerColor};}
thead th{padding:2.5mm 3mm;font-weight:600;font-size:8.5pt;color:${d.tableHeadColor};text-align:left;}
thead th.r{text-align:right;}
tbody tr{border-bottom:.5pt solid #f0f0f0;}
tbody td{padding:2.5mm 3mm;vertical-align:top;}
tbody td.r{text-align:right;font-variant-numeric:tabular-nums;}
tbody td.c{text-align:center;color:#aaa;font-size:8.5pt;}

.summen-wrap{display:flex;justify-content:flex-end;margin-top:1mm;}
.summen{width:72mm;background:#f9f9f9;border-radius:4px;padding:3mm 4mm;}
.summen-row{display:flex;justify-content:space-between;padding:1.5mm 0;font-size:9.5pt;color:#555;}
.summen-gesamt{font-weight:800;font-size:12pt;color:#1a1a1a;border-top:1.5pt solid #1a1a1a;margin-top:1.5mm;padding-top:2mm;}

.zahlungsinfo{margin-top:7mm;padding-top:4mm;border-top:.5pt solid #eee;font-size:9pt;color:#555;line-height:1.65;}
.zahlungsinfo strong{color:#1a1a1a;}

.hinweis-box{margin-top:4mm;padding:3mm 4mm;background:${d.accent}18;border-left:2.5pt solid ${d.accent};border-radius:0;font-size:9pt;color:#444;}

/* ─── Zahlungsbereich mit QR-Code ─── */
.zahlung-box{
  margin-top:6mm;
  padding:5mm 6mm;
  background:#f9fde8;
  border:1.5pt solid ${d.accent};
  border-radius:6px;
  display:flex;
  align-items:flex-start;
  gap:6mm;
}
.zahlung-box-text{flex:1;}
.zahlung-box-title{font-size:11pt;font-weight:700;color:#1a1a1a;margin-bottom:2mm;}
.zahlung-box-sub{font-size:9pt;color:#555;line-height:1.6;margin-bottom:3mm;}
.zahlung-btn{
  display:inline-block;
  background:${d.accent};
  color:#000;
  font-weight:700;
  font-size:9pt;
  padding:2.5mm 5mm;
  border-radius:4px;
  text-decoration:none;
}
.qr-wrap{flex-shrink:0;text-align:center;}
.qr-wrap img{width:100px;height:100px;display:block;}
.qr-label{font-size:7pt;color:#888;margin-top:1mm;text-align:center;}

.klausel{margin-top:4.5mm;}
.klausel h3{font-size:10pt;font-weight:700;color:${d.primary};margin-bottom:1.5mm;}
.klausel p{font-size:9pt;color:#444;line-height:1.65;}

.unterschrift-bereich{display:flex;gap:20mm;margin-top:14mm;}
.unterschrift-box{flex:1;padding-top:2mm;font-size:8.5pt;color:#555;border-top:1pt solid #333;}

.footer-main{margin-top:9mm;padding-top:3.5mm;border-top:.5pt solid #ddd;font-size:7.5pt;color:#aaa;display:flex;justify-content:space-between;flex-wrap:wrap;gap:3mm;}
</style>
</head>
<body>

<div class="print-bar no-print">
  <span>${typLabel} ${dok.nummer} — ${dok.kunde_name}</span>
  <button onclick="window.print()">Als PDF speichern</button>
</div>

<div class="page">

  <!-- BRIEFKOPF -->
  <div class="header">
    <div>
      ${betrieb?.logo_url ? `<img src="${betrieb.logo_url}" alt="Logo" class="logo-img">` : ''}
      <div class="firmenname">${betrieb?.name || 'Firmenname'}</div>
      <div class="firma-details">
        ${betrieb?.adresse ? betrieb.adresse + '<br>' : ''}
        ${betrieb?.telefon ? 'Tel: ' + betrieb.telefon : ''}${betrieb?.email ? (betrieb?.telefon ? ' &nbsp;·&nbsp; ' : '') + betrieb.email : ''}${(betrieb?.telefon||betrieb?.email)?'<br>':''}
        ${betrieb?.steuernummer ? 'Steuernr.: ' + betrieb.steuernummer : ''}
      </div>
    </div>
    <div>
      <div class="dok-typ">${typLabel}</div>
      <div class="dok-nr">Nr. ${dok.nummer}</div>
      <div class="dok-datum">Datum: ${heute}</div>
    </div>
  </div>

  <!-- EMPFÄNGER -->
  <div class="empfaenger-block">
    <div class="absender-klein">${betrieb?.name||''} &nbsp;·&nbsp; ${betrieb?.adresse||''}</div>
    <div class="empfaenger-name">${dok.kunde_name}</div>
    <div class="empfaenger-adresse">${(dok.kunde_adresse||'').replace(/,\s*/g,'<br>')}</div>
  </div>

  <div class="betreff">${isRech?'Rechnung für erbrachte Leistungen':isAngebot?'Angebot für Ihre Anfrage':'Bauvertrag'}</div>

  <div class="meta-row">
    <div class="meta-item"><label>Datum</label>${heute}</div>
    ${isRech&&faelligAm?`<div class="meta-item"><label>Zahlbar bis</label>${faelligAm}</div>`:''}
    ${isAngebot&&faelligAm?`<div class="meta-item"><label>Gültig bis</label>${faelligAm}</div>`:''}
    ${dok.ausfuehrungszeitraum?`<div class="meta-item"><label>Ausführung</label>${dok.ausfuehrungszeitraum}</div>`:''}
    ${isRech&&dok.zahlungsziel?`<div class="meta-item"><label>Zahlungsziel</label>${dok.zahlungsziel} Tage</div>`:''}
  </div>

  <!-- POSITIONEN -->
  <table>
    <thead><tr>
      <th style="width:8mm">Pos.</th><th>Beschreibung</th>
      <th class="r" style="width:18mm">Menge</th>
      <th class="r" style="width:22mm">Einzelpreis</th>
      <th class="r" style="width:24mm">Gesamtpreis</th>
    </tr></thead>
    <tbody>
      ${pos.map((p: any, i: number) => `
      <tr>
        <td class="c">${i+1}</td>
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
      <div class="summen-row summen-gesamt"><span>Gesamtbetrag</span><span>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</span></div>
    </div>
  </div>

  ${dok.anmerkungen && dok.anmerkungen.trim() ? `<div class="hinweis-box"><strong>Hinweis:</strong> ${dok.anmerkungen}</div>` : ''}

  <!-- ZAHLUNGSINFO + QR-CODE (nur bei Rechnung offen/überfällig) -->
  ${isRech && zahlungslink && dok.status !== 'bezahlt' ? `
  <div class="zahlung-box">
    <div class="zahlung-box-text">
      <div class="zahlung-box-title">Jetzt online bezahlen</div>
      <div class="zahlung-box-sub">
        Betrag: <strong>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</strong>
        ${faelligAm ? ` &nbsp;·&nbsp; Fällig bis: <strong>${faelligAm}</strong>` : ''}
        <br>Kreditkarte · SEPA · Apple Pay · Google Pay
      </div>
      <a href="${zahlungslink}" class="zahlung-btn">Rechnung bezahlen →</a>
      <p style="font-size:7.5pt;color:#888;margin-top:2mm;">Oder QR-Code scannen →</p>
    </div>
    ${qrUrl ? `<div class="qr-wrap"><img src="${qrUrl}" alt="QR-Code"><div class="qr-label">QR-Code<br>scannen</div></div>` : ''}
  </div>` : ''}

  ${isRech && !zahlungslink ? `
  <div class="zahlungsinfo">
    <p>Bitte überweisen Sie <strong>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</strong>
    ${faelligAm?`bis zum <strong>${faelligAm}</strong>`:`innerhalb von ${dok.zahlungsziel||14} Tagen`} auf folgendes Konto:</p>
    ${betrieb?.iban?`<p style="margin-top:2mm"><strong>IBAN:</strong> ${betrieb.iban}</p>`:''}
    <p style="margin-top:1.5mm">Verwendungszweck: <strong>${dok.nummer}</strong></p>
  </div>` : ''}

  ${isAngebot?`<div class="zahlungsinfo"><p>Dieses Angebot ist freibleibend${faelligAm?` und gültig bis <strong>${faelligAm}</strong>`:''}.</p></div>`:''}

  ${isVertrag?`
  <div class="klausel"><h3>§ 1 Vertragsgegenstand</h3><p>Der Auftragnehmer verpflichtet sich zur Ausführung der oben aufgeführten Leistungen gemäß den anerkannten Regeln der Technik.</p></div>
  <div class="klausel"><h3>§ 2 Vergütung</h3><p>Vergütung: <strong>${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} € (inkl. 19 % USt.)</strong>. Schlusszahlung ${dok.zahlungsziel||14} Tage nach Abnahme.</p></div>
  <div class="klausel"><h3>§ 3 Gewährleistung</h3><p>Gewährleistungsfrist: 5 Jahre ab Abnahme (§ 634a Abs. 1 Nr. 2 BGB).</p></div>
  <div class="klausel"><h3>§ 4 Datenschutz</h3><p>Personenbezogene Daten werden ausschließlich zur Vertragserfüllung verarbeitet (Art. 6 Abs. 1 lit. b DSGVO).</p></div>
  <div class="unterschrift-bereich">
    <div class="unterschrift-box">Ort, Datum &nbsp;·&nbsp; Auftraggeber<br><br><br>___________________________<br>${dok.kunde_name}</div>
    <div class="unterschrift-box">Ort, Datum &nbsp;·&nbsp; Auftragnehmer<br><br><br>___________________________<br>${betrieb?.name||''}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="footer-main">
    <div><strong>${betrieb?.name||''}</strong><br>${betrieb?.adresse||''}${betrieb?.steuernummer?'<br>Steuernr.: '+betrieb.steuernummer:''}</div>
    ${betrieb?.iban?`<div><strong>Bankverbindung</strong><br>IBAN: ${betrieb.iban}</div>`:''}
    <div>${betrieb?.telefon?'Tel: '+betrieb.telefon+'<br>':''}${betrieb?.email?betrieb.email:''}</div>
    ${betrieb?.fusszeile?`<div style="width:100%;color:#bbb;font-size:7pt;border-top:.5pt solid #eee;padding-top:2mm;margin-top:1mm;">${betrieb.fusszeile}</div>`:''}
  </div>
</div>

<script>if(window.location.search.includes('print=1')){window.addEventListener('load',()=>setTimeout(()=>window.print(),600))}</script>
</body></html>`
}
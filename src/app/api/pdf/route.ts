import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import QRCode from 'qrcode'

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
      const { data: anbieter } = await (supabaseAdmin as any)
        .from('zahlungsanbieter')
        .select('stripe_account_id,stripe_charges_enabled')
        .eq('user_id', dok.user_id)
        .eq('provider', 'stripe')
        .single()

      if (anbieter?.stripe_charges_enabled) {
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
              cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/zahlungen/fehler`,
            },
            { stripeAccount: anbieter.stripe_account_id }
          )
          zahlungslink = session.url
          await (supabaseAdmin as any).from('dokumente').update({
            zahlungslink: session.url, zahlungsanbieter: 'stripe', zahlung_session_id: session.id,
          }).eq('id', dokumentId)
        } catch (err) {
          console.error('Payment Link Fehler:', err)
        }
      }
    }

    // QR-Code für Stripe-Zahlungslink
    let stripeQrUrl = ''
    if (zahlungslink) {
      try {
        const qrBuffer = await QRCode.toBuffer(zahlungslink, {
          width: 200,
          margin: 1,
          color: { dark: '#0c0c0c', light: '#f5f9c8' },
        })
        const storagePath = `qrcodes/stripe_${dokumentId}.png`
        const { error: uploadError } = await (supabaseAdmin as any)
          .storage.from('email-assets')
          .upload(storagePath, qrBuffer, { contentType: 'image/png', upsert: true })

        if (!uploadError) {
          const { data: urlData } = (supabaseAdmin as any)
            .storage.from('email-assets').getPublicUrl(storagePath)
          stripeQrUrl = urlData?.publicUrl || ''
        } else {
          console.error('[QR Stripe] Upload-Fehler:', uploadError)
        }
      } catch (err) {
        console.error('[QR Stripe] Fehler:', err)
      }
    }

    const html = generatePDF(dok, betrieb, zahlungslink, stripeQrUrl)
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

function generatePDF(dok: any, betrieb: any, zahlungslink: string | null, stripeQrUrl = '') {
  const pos       = dok.positionen || []
  const heute     = new Date().toLocaleDateString('de-DE')
  const isRech    = dok.typ === 'rechnung'
  const isAngebot = dok.typ === 'angebot'
  const isVertrag = dok.typ === 'bauvertrag'
  const typLabel  = isRech ? 'RECHNUNG' : isAngebot ? 'ANGEBOT' : isVertrag ? 'BAUVERTRAG' : dok.typ.toUpperCase()
  const faelligAm = dok.gueltig_bis ? new Date(dok.gueltig_bis).toLocaleDateString('de-DE') : null
  const d         = getDesign(betrieb)
  const qrUrl     = stripeQrUrl || null

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>${typLabel} ${dok.nummer}</title>
<style>
/* ── Reset & base ── */
*{margin:0;padding:0;box-sizing:border-box;}
html{-webkit-text-size-adjust:100%;}
body{
  font-family:${d.fontStack};
  font-size:14px;
  color:#1a1a1a;
  background:#f0f0ee;
  line-height:1.5;
  -webkit-font-smoothing:antialiased;
}

/* ── Print bar (screen only) ── */
.print-bar{
  background:#0c0c0c;
  color:#fff;
  padding:12px 16px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  position:sticky;
  top:0;
  z-index:100;
  gap:8px;
}
.print-bar span{
  font-size:13px;
  opacity:.8;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  min-width:0;
}
.print-bar button{
  background:${d.accent};
  color:#000;
  border:none;
  padding:9px 18px;
  border-radius:6px;
  font-size:13px;
  font-weight:700;
  cursor:pointer;
  flex-shrink:0;
  white-space:nowrap;
}

/* ── Page wrapper ── */
.page{
  max-width:794px; /* A4 at 96dpi */
  margin:16px auto;
  padding:28px 20px 36px;
  background:#fff;
  border-radius:8px;
  box-shadow:0 2px 20px rgba(0,0,0,.08);
}

/* ── Header ── */
.header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:16px;
  margin-bottom:24px;
  padding-bottom:16px;
  border-bottom:${d.dividerHeight} solid ${d.dividerColor};
  flex-wrap:wrap;
}
.header-left{flex:1;min-width:180px;}
.header-right{text-align:right;flex-shrink:0;}
.logo-img{max-height:44px;max-width:140px;object-fit:contain;margin-bottom:6px;display:block;}
.firmenname{font-size:15px;font-weight:700;color:${d.headerColor};}
.firma-details{font-size:11px;color:#777;line-height:1.7;margin-top:3px;}
.dok-typ{font-size:clamp(18px,5vw,26px);font-weight:800;color:${d.typColor};letter-spacing:-0.5px;}
.dok-nr{font-size:11px;color:#aaa;margin-top:2px;}
.dok-datum{font-size:11px;color:#777;margin-top:1px;}

/* ── Empfänger ── */
.absender-klein{
  font-size:9px;
  color:#aaa;
  padding-bottom:6px;
  margin-bottom:6px;
  border-bottom:.5px solid #e8e8e8;
}
.empfaenger-block{margin-bottom:20px;}
.empfaenger-name{font-size:15px;font-weight:600;}
.empfaenger-adresse{font-size:13px;color:#555;line-height:1.65;margin-top:2px;}

/* ── Betreff ── */
.betreff{
  font-size:14px;
  font-weight:700;
  margin:0 0 14px;
  color:${d.primary};
  ${d.accentBar ? `border-left:3px solid ${d.accent};padding-left:10px;` : ''}
}

/* ── Meta row ── */
.meta-row{
  display:flex;
  gap:20px;
  flex-wrap:wrap;
  font-size:11px;
  color:#666;
  padding:10px 0;
  border-top:.5px solid #eee;
  border-bottom:.5px solid #eee;
  margin-bottom:20px;
}
.meta-item label{
  font-weight:600;
  color:#444;
  display:block;
  font-size:10px;
  margin-bottom:1px;
  text-transform:uppercase;
  letter-spacing:.3px;
}

/* ── Positions table — desktop ── */
.pos-table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:12px;}
.pos-table thead tr{
  background:${d.tableHeadBg};
  border-top:1px solid ${d.dividerColor};
  border-bottom:1px solid ${d.dividerColor};
}
.pos-table thead th{
  padding:8px 10px;
  font-weight:600;
  font-size:11px;
  color:${d.tableHeadColor};
  text-align:left;
  white-space:nowrap;
}
.pos-table thead th.r{text-align:right;}
.pos-table tbody tr{border-bottom:.5px solid #f0f0f0;}
.pos-table tbody td{padding:8px 10px;vertical-align:top;font-size:12px;}
.pos-table tbody td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
.pos-table tbody td.c{text-align:center;color:#bbb;font-size:11px;}
.pos-table td.desc{word-break:break-word;}

/* ── Mobile: cards statt Tabelle ── */
.pos-cards{display:none;}
.pos-card{
  border:1px solid #eee;
  border-radius:6px;
  padding:12px;
  margin-bottom:8px;
  background:#fafafa;
}
.pos-card-header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:8px;
  margin-bottom:6px;
}
.pos-card-nr{
  font-size:10px;
  font-weight:700;
  color:#aaa;
  background:#eee;
  border-radius:3px;
  padding:2px 6px;
  flex-shrink:0;
}
.pos-card-desc{font-size:13px;font-weight:600;color:#1a1a1a;flex:1;}
.pos-card-total{
  font-size:14px;
  font-weight:700;
  color:${d.primary};
  white-space:nowrap;
  flex-shrink:0;
}
.pos-card-meta{
  display:flex;
  gap:12px;
  font-size:11px;
  color:#777;
  flex-wrap:wrap;
}
.pos-card-meta span strong{color:#444;}

/* ── Summen ── */
.summen-wrap{display:flex;justify-content:flex-end;margin:8px 0 0;}
.summen{
  width:100%;
  max-width:280px;
  background:#f9f9f9;
  border-radius:6px;
  padding:12px 14px;
  border:1px solid #efefef;
}
.summen-row{
  display:flex;
  justify-content:space-between;
  padding:4px 0;
  font-size:12px;
  color:#666;
  gap:12px;
}
.summen-gesamt{
  font-weight:800;
  font-size:16px;
  color:#1a1a1a;
  border-top:1.5px solid #1a1a1a;
  margin-top:6px;
  padding-top:8px;
}

/* ── Hinweis box ── */
.hinweis-box{
  margin-top:16px;
  padding:10px 12px;
  background:${d.accent}20;
  border-left:3px solid ${d.accent};
  border-radius:0 4px 4px 0;
  font-size:12px;
  color:#444;
  line-height:1.6;
}

/* ── Zahlung Box ── */
.zahlung-box{
  margin-top:20px;
  padding:16px;
  background:#f9fde8;
  border:1.5px solid ${d.accent};
  border-radius:8px;
  display:flex;
  align-items:flex-start;
  gap:16px;
  flex-wrap:wrap;
}
.zahlung-box-text{flex:1;min-width:200px;}
.zahlung-box-title{font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;}
.zahlung-box-sub{font-size:12px;color:#666;line-height:1.65;margin-bottom:12px;}
.zahlung-btn{
  display:inline-block;
  background:${d.accent};
  color:#000;
  font-weight:700;
  font-size:13px;
  padding:10px 20px;
  border-radius:6px;
  text-decoration:none;
  -webkit-tap-highlight-color:transparent;
}
.zahlung-btn:active{opacity:.85;}
.qr-hint{font-size:10px;color:#999;margin-top:6px;}
.qr-wrap{flex-shrink:0;text-align:center;}
.qr-wrap img{width:90px;height:90px;display:block;border-radius:4px;}
.qr-label{font-size:9px;color:#aaa;margin-top:4px;}

/* ── Zahlungsinfo (kein Stripe) ── */
.zahlungsinfo{
  margin-top:20px;
  padding-top:14px;
  border-top:.5px solid #eee;
  font-size:12px;
  color:#666;
  line-height:1.7;
}
.zahlungsinfo strong{color:#1a1a1a;}
.iban-block{
  margin-top:8px;
  padding:10px 12px;
  background:#f5f5f5;
  border-radius:5px;
  font-size:12px;
  font-family:'Courier New',monospace;
  letter-spacing:.5px;
  word-break:break-all;
}

/* ── Angebot / Vertrag ── */
.klausel{margin-top:14px;}
.klausel h3{font-size:13px;font-weight:700;color:${d.primary};margin-bottom:5px;}
.klausel p{font-size:12px;color:#555;line-height:1.65;}

.unterschrift-bereich{
  display:flex;
  gap:20px;
  margin-top:32px;
  flex-wrap:wrap;
}
.unterschrift-box{
  flex:1;
  min-width:160px;
  padding-top:8px;
  font-size:11px;
  color:#666;
  border-top:1px solid #333;
  line-height:1.7;
}

/* ── Footer ── */
.footer-main{
  margin-top:28px;
  padding-top:12px;
  border-top:.5px solid #e0e0e0;
  font-size:10px;
  color:#bbb;
  display:flex;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:10px;
  line-height:1.7;
}
.footer-main strong{color:#999;}
.footer-extra{
  width:100%;
  color:#ccc;
  font-size:9px;
  border-top:.5px solid #eee;
  padding-top:6px;
  margin-top:4px;
}

/* ── MOBILE breakpoint ── */
@media (max-width:600px){
  body{background:#f0f0ee;}
  .page{
    margin:0;
    border-radius:0;
    box-shadow:none;
    padding:16px 14px 28px;
    min-height:100vh;
  }

  .print-bar{padding:10px 14px;}
  .print-bar span{font-size:12px;}
  .print-bar button{padding:8px 14px;font-size:12px;}

  /* Header: stack on very small screens */
  .header{flex-direction:column-reverse;gap:4px;}
  .header-right{text-align:left;}
  .dok-typ{font-size:22px;}

  /* Table → cards */
  .pos-table{display:none;}
  .pos-cards{display:block;}

  /* Summen full width */
  .summen-wrap{justify-content:stretch;}
  .summen{max-width:100%;width:100%;}

  /* Zahlung box stack */
  .zahlung-box{flex-direction:column;gap:14px;}
  .qr-wrap{
    display:flex;
    align-items:center;
    gap:10px;
  }
  .qr-wrap img{width:72px;height:72px;}
  .qr-label{margin-top:0;}
  .zahlung-btn{
    width:100%;
    text-align:center;
    padding:13px;
    font-size:15px;
    border-radius:8px;
  }

  .unterschrift-bereich{flex-direction:column;gap:20px;}
  .footer-main{flex-direction:column;gap:6px;}

  .meta-row{gap:14px;}
}

/* ── Print styles ── */
@page{size:A4;margin:18mm 20mm 25mm 22mm;}
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
  body{background:#fff!important;font-size:10pt;}
  .no-print{display:none!important;}
  .page{
    margin:0!important;
    padding:0!important;
    box-shadow:none!important;
    border-radius:0!important;
    max-width:none!important;
  }
  /* Always show table in print, never cards */
  .pos-table{display:table!important;}
  .pos-cards{display:none!important;}
  .summen{max-width:260px!important;width:260px!important;}
  .summen-wrap{justify-content:flex-end!important;}
  .zahlung-btn{border:2px solid #000!important;}
}
</style>
</head>
<body>

<!-- Sticky print bar (hidden in print) -->
<div class="print-bar no-print">
  <span>${typLabel} ${dok.nummer} — ${dok.kunde_name}</span>
  <button onclick="window.print()">Als PDF speichern</button>
</div>

<div class="page">

  <!-- ── BRIEFKOPF ── -->
  <div class="header">
    <div class="header-left">
      ${betrieb?.logo_url ? `<img src="${betrieb.logo_url}" alt="Logo" class="logo-img">` : ''}
      <div class="firmenname">${betrieb?.name || 'Firmenname'}</div>
      <div class="firma-details">
        ${betrieb?.adresse ? betrieb.adresse + '<br>' : ''}
        ${betrieb?.telefon ? 'Tel: ' + betrieb.telefon : ''}${betrieb?.email ? (betrieb?.telefon ? ' &nbsp;·&nbsp; ' : '') + betrieb.email : ''}${(betrieb?.telefon || betrieb?.email) ? '<br>' : ''}
        ${betrieb?.steuernummer ? 'Steuernr.: ' + betrieb.steuernummer : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="dok-typ">${typLabel}</div>
      <div class="dok-nr">Nr. ${dok.nummer}</div>
      <div class="dok-datum">Datum: ${heute}</div>
    </div>
  </div>

  <!-- ── EMPFÄNGER ── -->
  <div class="empfaenger-block">
    <div class="absender-klein">${betrieb?.name || ''} &nbsp;·&nbsp; ${betrieb?.adresse || ''}</div>
    <div class="empfaenger-name">${dok.kunde_name}</div>
    <div class="empfaenger-adresse">${(dok.kunde_adresse || '').replace(/,\s*/g, '<br>')}</div>
  </div>

  <div class="betreff">${isRech ? 'Rechnung für erbrachte Leistungen' : isAngebot ? 'Angebot für Ihre Anfrage' : 'Bauvertrag'}</div>

  <!-- ── META ── -->
  <div class="meta-row">
    <div class="meta-item"><label>Datum</label>${heute}</div>
    ${isRech && faelligAm ? `<div class="meta-item"><label>Zahlbar bis</label>${faelligAm}</div>` : ''}
    ${isAngebot && faelligAm ? `<div class="meta-item"><label>Gültig bis</label>${faelligAm}</div>` : ''}
    ${dok.ausfuehrungszeitraum ? `<div class="meta-item"><label>Ausführung</label>${dok.ausfuehrungszeitraum}</div>` : ''}
    ${isRech && dok.zahlungsziel ? `<div class="meta-item"><label>Zahlungsziel</label>${dok.zahlungsziel} Tage</div>` : ''}
  </div>

  <!-- ── POSITIONEN: Tabelle (desktop/print) ── -->
  <table class="pos-table">
    <thead><tr>
      <th style="width:32px">Pos.</th>
      <th>Beschreibung</th>
      <th class="r" style="width:80px">Menge</th>
      <th class="r" style="width:90px">Einzelpreis</th>
      <th class="r" style="width:100px">Gesamtpreis</th>
    </tr></thead>
    <tbody>
      ${pos.map((p: any, i: number) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="desc">${p.beschreibung}</td>
        <td class="r">${p.menge} ${p.einheit}</td>
        <td class="r">${Number(p.einzelpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
        <td class="r">${Number(p.gesamtpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <!-- ── POSITIONEN: Cards (mobile) ── -->
  <div class="pos-cards">
    ${pos.map((p: any, i: number) => `
    <div class="pos-card">
      <div class="pos-card-header">
        <span class="pos-card-nr">${i + 1}</span>
        <span class="pos-card-desc">${p.beschreibung}</span>
        <span class="pos-card-total">${Number(p.gesamtpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
      </div>
      <div class="pos-card-meta">
        <span><strong>Menge:</strong> ${p.menge} ${p.einheit}</span>
        <span><strong>Einzelpreis:</strong> ${Number(p.einzelpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
      </div>
    </div>`).join('')}
  </div>

  <!-- ── SUMMEN ── -->
  <div class="summen-wrap">
    <div class="summen">
      <div class="summen-row"><span>Nettobetrag</span><span>${Number(dok.netto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></div>
      <div class="summen-row"><span>Umsatzsteuer 19 %</span><span>${Number(dok.mwst).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></div>
      <div class="summen-row summen-gesamt"><span>Gesamtbetrag</span><span>${Number(dok.brutto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></div>
    </div>
  </div>

  ${dok.anmerkungen && dok.anmerkungen.trim() ? `<div class="hinweis-box"><strong>Hinweis:</strong> ${dok.anmerkungen}</div>` : ''}

  <!-- ── ZAHLUNGSBEREICH (Stripe) ── -->
  ${isRech && zahlungslink && dok.status !== 'bezahlt' ? `
  <div class="zahlung-box">
    <div class="zahlung-box-text">
      <div class="zahlung-box-title">Jetzt online bezahlen</div>
      <div class="zahlung-box-sub">
        Betrag: <strong>${Number(dok.brutto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</strong>
        ${faelligAm ? ` &nbsp;·&nbsp; Fällig bis: <strong>${faelligAm}</strong>` : ''}
        <br>Kreditkarte · SEPA · Apple Pay · Google Pay
      </div>
      <a href="${zahlungslink}" class="zahlung-btn">Rechnung bezahlen →</a>
      ${qrUrl ? `<p class="qr-hint">Oder QR-Code scannen →</p>` : ''}
    </div>
    ${qrUrl ? `
    <div class="qr-wrap">
      <img src="${qrUrl}" alt="QR-Code">
      <div class="qr-label">QR-Code<br>scannen</div>
    </div>` : ''}
  </div>` : ''}

  <!-- ── ZAHLUNGSINFO (kein Stripe) ── -->
  ${isRech && !zahlungslink ? `
  <div class="zahlungsinfo">
    <p>Bitte überweisen Sie <strong>${Number(dok.brutto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</strong>
    ${faelligAm ? `bis zum <strong>${faelligAm}</strong>` : `innerhalb von ${dok.zahlungsziel || 14} Tagen`} auf folgendes Konto:</p>
    ${betrieb?.iban ? `<div class="iban-block"><strong>IBAN:</strong> ${betrieb.iban}</div>` : ''}
    <p style="margin-top:8px">Verwendungszweck: <strong>${dok.nummer}</strong></p>
  </div>` : ''}

  ${isAngebot ? `<div class="zahlungsinfo"><p>Dieses Angebot ist freibleibend${faelligAm ? ` und gültig bis <strong>${faelligAm}</strong>` : ''}.</p></div>` : ''}

  <!-- ── BAUVERTRAG KLAUSELN ── -->
  ${isVertrag ? `
  <div class="klausel"><h3>§ 1 Vertragsgegenstand</h3><p>Der Auftragnehmer verpflichtet sich zur Ausführung der oben aufgeführten Leistungen gemäß den anerkannten Regeln der Technik.</p></div>
  <div class="klausel"><h3>§ 2 Vergütung</h3><p>Vergütung: <strong>${Number(dok.brutto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € (inkl. 19 % USt.)</strong>. Schlusszahlung ${dok.zahlungsziel || 14} Tage nach Abnahme.</p></div>
  <div class="klausel"><h3>§ 3 Gewährleistung</h3><p>Gewährleistungsfrist: 5 Jahre ab Abnahme (§ 634a Abs. 1 Nr. 2 BGB).</p></div>
  <div class="klausel"><h3>§ 4 Datenschutz</h3><p>Personenbezogene Daten werden ausschließlich zur Vertragserfüllung verarbeitet (Art. 6 Abs. 1 lit. b DSGVO).</p></div>
  <div class="unterschrift-bereich">
    <div class="unterschrift-box">Ort, Datum &nbsp;·&nbsp; Auftraggeber<br><br><br>___________________________<br>${dok.kunde_name}</div>
    <div class="unterschrift-box">Ort, Datum &nbsp;·&nbsp; Auftragnehmer<br><br><br>___________________________<br>${betrieb?.name || ''}</div>
  </div>` : ''}

  <!-- ── FOOTER ── -->
  <div class="footer-main">
    <div><strong>${betrieb?.name || ''}</strong><br>${betrieb?.adresse || ''}${betrieb?.steuernummer ? '<br>Steuernr.: ' + betrieb.steuernummer : ''}</div>
    ${betrieb?.iban ? `<div><strong>Bankverbindung</strong><br>IBAN: ${betrieb.iban}</div>` : ''}
    <div>${betrieb?.telefon ? 'Tel: ' + betrieb.telefon + '<br>' : ''}${betrieb?.email ? betrieb.email : ''}</div>
    ${betrieb?.fusszeile ? `<div class="footer-extra">${betrieb.fusszeile}</div>` : ''}
  </div>

</div>

<script>
  if(window.location.search.includes('print=1')){
    window.addEventListener('load', () => setTimeout(() => window.print(), 600))
  }
</script>
</body></html>`
}
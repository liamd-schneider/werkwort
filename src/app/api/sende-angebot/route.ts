import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import QRCode from 'qrcode'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { dokumentId, kundeEmail } = await req.json()

    const { data: dok } = await (supabaseAdmin as any)
      .from('dokumente').select('*').eq('id', dokumentId).eq('user_id', user.id).single()
    if (!dok) return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 })

    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe').select('*').eq('user_id', user.id).single()

    const typLabel   = dok.typ === 'angebot' ? 'Angebot' : dok.typ === 'rechnung' ? 'Rechnung' : dok.typ
    const isRechnung = dok.typ === 'rechnung'
    const faelligAm  = dok.gueltig_bis ? new Date(dok.gueltig_bis).toLocaleDateString('de-DE') : null
    const pdfUrl     = `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf?id=${dokumentId}&public=1`

    // ── QR-Code generieren und in Supabase Storage hochladen ─────────────────
    let qrImageUrl = ''
    try {
      const qrBuffer = await QRCode.toBuffer(pdfUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#0c0c0c', light: '#f5f9c8' },
      })

      const storagePath = `qrcodes/${dokumentId}.png`

      const { error: uploadError } = await (supabaseAdmin as any)
        .storage
        .from('email-assets')
        .upload(storagePath, qrBuffer, {
          contentType: 'image/png',
          upsert: true,
        })

      if (uploadError) {
        console.error('[QR] Upload-Fehler:', uploadError)
      } else {
        const { data: urlData } = (supabaseAdmin as any)
          .storage
          .from('email-assets')
          .getPublicUrl(storagePath)

        qrImageUrl = urlData?.publicUrl || ''
        console.log('[QR] URL:', qrImageUrl)
      }
    } catch (err) {
      console.error('[QR] Fehler:', err)
    }

    // ── PDF-Anhang (nur bei Rechnung mit ZUGFeRD-XML) ────────────────────────
    const attachments: { filename: string; content: string; type: string }[] = []

    if (isRechnung && dok.zugferd_xml) {
      try {
        const pdfRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf-binary?id=${dokumentId}`,
          { headers: { authorization: authHeader } }
        )

        let pdfBytes: Uint8Array
        if (pdfRes.ok) {
          pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
        } else {
          pdfBytes = buildMinimalPdf()
        }

        pdfBytes = await embedXmlInPdf(pdfBytes, dok.zugferd_xml)

        attachments.push({
          filename: `${dok.nummer}_ZUGFeRD_EN16931.pdf`,
          content:  Buffer.from(pdfBytes).toString('base64'),
          type:     'application/pdf',
        })
      } catch (err) {
        console.error('PDF-Anhang Fehler:', err)
      }
    }

    // ── E-Mail-HTML ───────────────────────────────────────────────────────────
    const qrBlock = qrImageUrl
      ? `
    <div style="border:2px dashed #d4e840;border-radius:8px;padding:16px;margin:16px 0;background:#fafde8;box-sizing:border-box;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
        <tr>
          <td style="width:136px;vertical-align:middle;">
            <img src="${qrImageUrl}" width="120" height="120" alt="QR-Code" style="display:block;border-radius:4px;" />
          </td>
          <td style="vertical-align:middle;padding-left:16px;">
            <p style="font-size:13px;font-weight:700;color:#0c0c0c;margin:0 0 4px;">Oder QR-Code scannen →</p>
            <p style="font-size:12px;color:#666;margin:0;">Direkt zum PDF auf Ihrem Smartphone</p>
          </td>
        </tr>
      </table>
    </div>`
      : ''

    const emailHtml = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }

    @media only screen and (max-width:600px) {
      .wrapper { width:100% !important; max-width:100% !important; }
      .content-cell { padding:20px 16px !important; }
      .header-cell { padding:16px !important; }
      .footer-cell { padding:12px 16px !important; }
      .doc-number { display:none !important; }
      .btn-link { padding:14px 20px !important; font-size:15px !important; display:block !important; text-align:center !important; }
      .amount-value { font-size:17px !important; }
      .info-table td { font-size:12px !important; }
      .qr-block-table { display:block !important; width:100% !important; }
      .qr-img-td { display:block !important; width:100% !important; text-align:center !important; padding-bottom:12px !important; }
      .qr-img-td img { margin:0 auto !important; }
      .qr-text-td { display:block !important; width:100% !important; padding-left:0 !important; text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f0f0f0;">
  <tr>
    <td align="center" style="padding:20px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="wrapper" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.12);">

        <!-- Header -->
        <tr>
          <td class="header-cell" style="background:#0c0c0c;padding:20px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:middle;">
                  <span style="font-size:18px;font-family:Arial,sans-serif;">
                    <span style="color:#d4e840;font-weight:700;">e</span><span style="color:#ffffff;font-weight:300;">Werk</span><span style="color:#d4e840;font-weight:700;">wort</span>
                  </span>
                </td>
                <td class="doc-number" align="right" style="vertical-align:middle;">
                  <span style="color:#888888;font-size:12px;">${typLabel} · ${dok.nummer}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td class="content-cell" style="padding:28px;">

            <p style="font-size:15px;color:#333333;margin:0 0 8px;line-height:1.5;">Sehr geehrte${dok.kunde_name.includes('Familie') ? '' : 'r'} ${dok.kunde_name},</p>
            <p style="font-size:14px;color:#555555;line-height:1.7;margin:0 0 24px;">
              ${isRechnung
                ? `anbei erhalten Sie unsere Rechnung für die erbrachten Leistungen${dok.zugferd_xml ? ' als <strong>E-Rechnung (ZUGFeRD EN16931)</strong>' : ''}.`
                : `vielen Dank für Ihr Interesse. Anbei finden Sie unser Angebot für die angefragten Leistungen.`}
            </p>

            <!-- Info-Box -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="info-table" style="background:#f9f9f9;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="color:#888888;font-size:13px;padding:5px 0;border-bottom:1px solid #eeeeee;">${typLabel}-Nummer</td>
                      <td align="right" style="font-size:13px;font-weight:600;color:#111111;padding:5px 0;border-bottom:1px solid #eeeeee;">${dok.nummer}</td>
                    </tr>
                    <tr>
                      <td style="color:#888888;font-size:13px;padding:5px 0;border-bottom:1px solid #eeeeee;">Gesamtbetrag (inkl. MwSt.)</td>
                      <td align="right" class="amount-value" style="font-size:15px;font-weight:700;color:#0c0c0c;padding:5px 0;border-bottom:1px solid #eeeeee;">${dok.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</td>
                    </tr>
                    ${dok.ausfuehrungszeitraum ? `
                    <tr>
                      <td style="color:#888888;font-size:13px;padding:5px 0;border-bottom:1px solid #eeeeee;">Ausführungszeitraum</td>
                      <td align="right" style="font-size:13px;color:#333333;padding:5px 0;border-bottom:1px solid #eeeeee;">${dok.ausfuehrungszeitraum}</td>
                    </tr>` : ''}
                    ${faelligAm ? `
                    <tr>
                      <td style="color:#888888;font-size:13px;padding:5px 0;${isRechnung && !betrieb?.iban ? '' : 'border-bottom:1px solid #eeeeee;'}">${isRechnung ? 'Zahlbar bis' : 'Gültig bis'}</td>
                      <td align="right" style="font-size:13px;padding:5px 0;font-weight:${isRechnung ? '600' : '400'};color:${isRechnung ? '#e85d24' : '#333333'};${isRechnung && !betrieb?.iban ? '' : 'border-bottom:1px solid #eeeeee;'}">${faelligAm}</td>
                    </tr>` : ''}
                    ${isRechnung && betrieb?.iban ? `
                    <tr>
                      <td style="color:#888888;font-size:13px;padding:5px 0;">IBAN</td>
                      <td align="right" style="font-size:12px;color:#333333;padding:5px 0;font-family:monospace,Courier,serif;word-break:break-all;">${betrieb.iban}</td>
                    </tr>` : ''}
                  </table>
                  ${isRechnung ? `<p style="font-size:12px;color:#888888;margin:10px 0 0;">Verwendungszweck: <strong>${dok.nummer}</strong></p>` : ''}
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
              <tr>
                <td align="center">
                  <a href="${pdfUrl}" class="btn-link" style="background:#d4e840;color:#0c0c0c;padding:13px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;letter-spacing:0.01em;">
                    ${typLabel} als PDF öffnen
                  </a>
                </td>
              </tr>
            </table>

            <!-- QR-Block -->
            ${qrImageUrl ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="qr-block-table" style="border:2px dashed #d4e840;border-radius:8px;background:#fafde8;margin:0 0 20px;">
              <tr>
                <td style="padding:16px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td class="qr-img-td" style="width:136px;vertical-align:middle;">
                        <img src="${qrImageUrl}" width="120" height="120" alt="QR-Code" style="display:block;border-radius:4px;" />
                      </td>
                      <td class="qr-text-td" style="vertical-align:middle;padding-left:16px;">
                        <p style="font-size:13px;font-weight:700;color:#0c0c0c;margin:0 0 4px;">QR-Code scannen →</p>
                        <p style="font-size:12px;color:#666666;margin:0;">Direkt zum PDF auf Ihrem Smartphone</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>` : ''}

            <!-- Grußformel -->
            <p style="font-size:13px;color:#555555;margin:0;line-height:1.7;">
              ${isRechnung
                ? 'Bei Fragen zur Rechnung stehen wir Ihnen gerne zur Verfügung.'
                : 'Bei Rückfragen oder zur Auftragserteilung antworten Sie bitte direkt auf diese E-Mail.'}
              <br>Mit freundlichen Grüßen,<br><strong>${betrieb?.name || ''}</strong>
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td class="footer-cell" style="background:#f9f9f9;padding:14px 28px;border-top:1px solid #eeeeee;">
            <p style="font-size:11px;color:#aaaaaa;margin:0 0 5px;line-height:1.6;">
              ${betrieb?.name || ''} · ${betrieb?.adresse || ''}${betrieb?.steuernummer ? ' · Steuernr.: ' + betrieb.steuernummer : ''}${betrieb?.iban ? ' · IBAN: ' + betrieb.iban : ''}
            </p>
            <p style="font-size:10px;color:#cccccc;margin:0;line-height:1.6;">
              Diese E-Mail wurde im Auftrag von ${betrieb?.name || ''} über eWerkwort versendet.
              Ihre E-Mail-Adresse wird ausschließlich zur Übermittlung dieses Dokuments verwendet (Art. 6 Abs. 1 lit. b DSGVO).
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body></html>`

    // ── Versand ───────────────────────────────────────────────────────────────
     const { error } = await resend.emails.send({
      from:        `${betrieb?.name || 'Werkwort'} <noreply@e-werkwort.com>`,
      to:          kundeEmail,
      replyTo:     betrieb?.email || undefined,
      subject:     `${typLabel} Nr. ${dok.nummer} von ${betrieb?.name||''}`,
      html:        emailHtml,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    if (error) {
      console.error('Resend Fehler:', error)
      return NextResponse.json({ error: 'E-Mail konnte nicht gesendet werden' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Sende Fehler:', error)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function buildMinimalPdf(): Uint8Array {
  const src =
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'xref\n0 4\n' +
    '0000000000 65535 f\r\n0000000009 00000 n\r\n0000000058 00000 n\r\n0000000115 00000 n\r\n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
  return new TextEncoder().encode(src)
}

async function embedXmlInPdf(pdfBytes: Uint8Array, xmlStr: string): Promise<Uint8Array> {
  const { PDFDocument, PDFName, PDFString } = await import('pdf-lib')
  const xmlBytes = new TextEncoder().encode(xmlStr)
  const pdfDoc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const context  = pdfDoc.context

  const efStream = context.stream(xmlBytes, {
    Type:    'EmbeddedFile',
    Subtype: 'application/xml',
    Params:  context.obj({ Size: xmlBytes.length, ModDate: PDFString.of(new Date().toISOString()) }),
  })
  const efRef = context.register(efStream)

  const filespecDict = context.obj({
    Type:            PDFName.of('Filespec'),
    F:               PDFString.of('factur-x.xml'),
    UF:              PDFString.of('factur-x.xml'),
    EF:              context.obj({ F: efRef, UF: efRef }),
    Desc:            PDFString.of('ZUGFeRD Rechnungsdaten EN16931'),
    AFRelationship:  PDFName.of('Data'),
  })
  const filespecRef = context.register(filespecDict)

  const catalog = pdfDoc.catalog
  catalog.set(
    PDFName.of('Names'),
    context.obj({ EmbeddedFiles: context.obj({ Names: context.obj([PDFString.of('factur-x.xml'), filespecRef]) }) })
  )
  catalog.set(PDFName.of('AF'), context.obj([filespecRef]))

  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`

  const xmpStream = context.stream(new TextEncoder().encode(xmp), { Type: 'Metadata', Subtype: 'XML' })
  const xmpRef    = context.register(xmpStream)
  catalog.set(PDFName.of('Metadata'), xmpRef)

  return pdfDoc.save()
}

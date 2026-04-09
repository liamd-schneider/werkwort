import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

    const typLabel = dok.typ === 'angebot' ? 'Angebot' : dok.typ === 'rechnung' ? 'Rechnung' : dok.typ
    const isRechnung = dok.typ === 'rechnung'
    const faelligAm = dok.gueltig_bis ? new Date(dok.gueltig_bis).toLocaleDateString('de-DE') : null
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf?id=${dokumentId}&public=1`

    const emailHtml = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">

  <div style="background:#0c0c0c;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
    <span style="color:#fff;font-size:18px;font-weight:300;">werk<span style="font-weight:700;color:#d4e840;">wort</span></span>
    <span style="color:#888;font-size:12px;">${typLabel} · ${dok.nummer}</span>
  </div>

  <div style="padding:28px;">
    <p style="font-size:15px;color:#333;margin:0 0 8px;">Sehr geehrte${dok.kunde_name.includes('Familie') ? '' : 'r'} ${dok.kunde_name},</p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 20px;">
      ${isRechnung
        ? `anbei erhalten Sie unsere Rechnung für die erbrachten Leistungen.`
        : `vielen Dank für Ihr Interesse. Anbei finden Sie unser Angebot für die angefragten Leistungen.`}
    </p>

    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:20px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#888;font-size:13px;padding:4px 0;">${typLabel}-Nummer</td><td style="font-size:13px;text-align:right;font-weight:600;">${dok.nummer}</td></tr>
        <tr><td style="color:#888;font-size:13px;padding:4px 0;">Gesamtbetrag (inkl. MwSt.)</td><td style="font-size:15px;text-align:right;font-weight:700;">${dok.brutto.toLocaleString('de-DE',{minimumFractionDigits:2})} €</td></tr>
        ${dok.ausfuehrungszeitraum ? `<tr><td style="color:#888;font-size:13px;padding:4px 0;">Ausführungszeitraum</td><td style="font-size:13px;text-align:right;">${dok.ausfuehrungszeitraum}</td></tr>` : ''}
        ${faelligAm ? `<tr><td style="color:#888;font-size:13px;padding:4px 0;">${isRechnung ? 'Zahlbar bis' : 'Gültig bis'}</td><td style="font-size:13px;text-align:right;${isRechnung ? 'font-weight:600;color:#e85d24;' : ''}">${faelligAm}</td></tr>` : ''}
        ${isRechnung && betrieb?.iban ? `<tr><td style="color:#888;font-size:13px;padding:4px 0;">IBAN</td><td style="font-size:13px;text-align:right;font-family:monospace;">${betrieb.iban}</td></tr>` : ''}
      </table>
      ${isRechnung ? `<p style="font-size:12px;color:#888;margin:8px 0 0;">Verwendungszweck: <strong>${dok.nummer}</strong></p>` : ''}
    </div>

    <div style="text-align:center;margin:20px 0;">
      <a href="${pdfUrl}" style="background:#d4e840;color:#0c0c0c;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">
        ${typLabel} als PDF öffnen
      </a>
    </div>

    <p style="font-size:13px;color:#555;margin:16px 0 0;">
      ${isRechnung
        ? 'Bei Fragen zur Rechnung stehen wir Ihnen gerne zur Verfügung.'
        : 'Bei Rückfragen oder zur Auftragserteilung antworten Sie bitte direkt auf diese E-Mail.'}
      <br>Mit freundlichen Grüßen,<br><strong>${betrieb?.name||''}</strong>
    </p>
  </div>

  <div style="background:#f9f9f9;padding:14px 28px;border-top:1px solid #eee;">
    <p style="font-size:11px;color:#aaa;margin:0;line-height:1.6;">
      ${betrieb?.name||''} · ${betrieb?.adresse||''}${betrieb?.steuernummer?' · Steuernr.: '+betrieb.steuernummer:''}${betrieb?.iban?' · IBAN: '+betrieb.iban:''}
    </p>
    <p style="font-size:10px;color:#ccc;margin:5px 0 0;">
      Diese E-Mail wurde im Auftrag von ${betrieb?.name||''} über Werkwort versendet.
      Ihre E-Mail-Adresse wird ausschließlich zur Übermittlung dieses Dokuments verwendet (Art. 6 Abs. 1 lit. b DSGVO).
    </p>
  </div>
</div>
</body></html>`

    const { error } = await resend.emails.send({
      from: `${betrieb?.name || 'Werkwort'} <onboarding@resend.dev>`,
      to: kundeEmail,
      
      replyTo: betrieb?.email || undefined,
      subject: `${typLabel} Nr. ${dok.nummer} von ${betrieb?.name||''}`,
      html: emailHtml,
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
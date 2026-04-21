// app/api/pdf-binary/route.ts
// Rendert das HTML-PDF-Template mit Puppeteer zu echtem PDF-Binary.
// Wird von /api/zugferd genutzt, um ein befülltes PDF für ZUGFeRD zu erzeugen.
//
// npm install puppeteer
// (oder: npm install puppeteer-core + @sparticuz/chromium für Vercel/Lambda)

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ─── Puppeteer laden ─────────────────────────────────────────────
// Vercel / Lambda: puppeteer-core + @sparticuz/chromium verwenden.
// Lokal / Node-Server: einfach puppeteer reicht.
async function getBrowser() {
  // Auf Vercel/Linux: @sparticuz/chromium verfügbar?
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = (await import('puppeteer-core')).default
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }

  // Lokal (Windows/Mac/Linux) — puppeteer bringt Chromium selbst mit
  const puppeteer = (await import('puppeteer')).default
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const dokumentId = searchParams.get('id')
    if (!dokumentId) return NextResponse.json({ error: 'ID fehlt' }, { status: 400 })

    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    // HTML von /api/pdf holen (gleiche Auth weiterreichen)
    const htmlRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf?id=${dokumentId}`,
      { headers: { authorization: authHeader } }
    )
    if (!htmlRes.ok) {
      return NextResponse.json({ error: 'HTML-Template nicht verfügbar' }, { status: 502 })
    }
    const html = await htmlRes.text()

    // Mit Puppeteer zu PDF rendern
    const browser = await getBrowser()
    const page = await browser.newPage()

    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '28mm', left: '25mm' },
    })

    await browser.close()

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="rechnung-${dokumentId}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('pdf-binary Fehler:', error)
    return NextResponse.json({ error: error.message ?? 'Interner Fehler' }, { status: 500 })
  }
}
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REDIRECT_URI     = `${process.env.NEXT_PUBLIC_APP_URL}/api/kalender/callback`

// Google leitet hierher zurück nach OAuth-Zustimmung
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/kalender?error=oauth_abgebrochen`)
  }

  try {
    // State dekodieren → User ID holen
    const { user_id } = JSON.parse(Buffer.from(state, 'base64url').toString())
    if (!user_id) throw new Error('Ungültiger State')

    // Code gegen Tokens tauschen
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    })

    if (!tokenRes.ok) throw new Error('Token-Austausch fehlgeschlagen')
    const tokens = await tokenRes.json()

    // Kalender-Name laden (primärer Kalender)
    let kalenderName = 'Primärer Kalender'
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      })
      const cal = await calRes.json()
      kalenderName = cal.summary || kalenderName
    } catch {}

    // In DB speichern
    await (supabaseAdmin as any).from('integrationen').upsert({
      user_id,
      provider:      'google_calendar',
      aktiv:         true,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      meta:          { kalender_name: kalenderName },
      erstellt_am:   new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/kalender?google=verbunden`)

  } catch (err) {
    console.error('OAuth Callback Fehler:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/kalender?error=oauth_fehler`)
  }
}
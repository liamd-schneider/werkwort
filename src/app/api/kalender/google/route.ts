import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Google Calendar OAuth2 Flow
// Benötigt in .env.local:
// GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
// GOOGLE_CLIENT_SECRET=xxx
// NEXT_PUBLIC_APP_URL=http://localhost:3000

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CAL_URL   = 'https://www.googleapis.com/calendar/v3'
const REDIRECT_URI     = `${process.env.NEXT_PUBLIC_APP_URL}/api/kalender/callback`
const SCOPES           = 'https://www.googleapis.com/auth/calendar.events'

// GET /api/kalender/google?action=auth → Redirect zu Google
// GET /api/kalender/google?action=sync → Termine synchronisieren
// GET /api/kalender/google?action=status → Verbindungsstatus
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // ── Status: Ist Google Calendar verbunden? ────────────────────
  if (action === 'status') {
    const { data: integration } = await (supabaseAdmin as any)
      .from('integrationen')
      .select('provider,aktiv,erstellt_am,meta')
      .eq('user_id', user.id)
      .eq('provider', 'google_calendar')
      .single()

    return NextResponse.json({
      verbunden: !!integration?.aktiv,
      erstellt_am: integration?.erstellt_am,
      kalender_name: integration?.meta?.kalender_name,
    })
  }

  // ── Auth: OAuth-Redirect zu Google ────────────────────────────
  if (action === 'auth') {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: 'Google Client ID nicht konfiguriert. Bitte in .env.local setzen.' }, { status: 500 })
    }

    const state  = Buffer.from(JSON.stringify({ user_id: user.id, ts: Date.now() })).toString('base64url')
    const params = new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES,
      access_type:   'offline',
      prompt:        'consent',
      state,
    })
    return NextResponse.json({ url: `${GOOGLE_AUTH_URL}?${params}` })
  }

  // ── Sync: Termine zu Google Calendar pushen ───────────────────
  if (action === 'sync') {
    return await syncZuGoogle(user.id)
  }

  // ── Disconnect ────────────────────────────────────────────────
  if (action === 'disconnect') {
    await (supabaseAdmin as any)
      .from('integrationen')
      .update({ aktiv: false })
      .eq('user_id', user.id)
      .eq('provider', 'google_calendar')
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 })
}

// ─── Termine zu Google Calendar synchronisieren ─────────────────
async function syncZuGoogle(userId: string) {
  // Token laden
  const { data: integration } = await (supabaseAdmin as any)
    .from('integrationen')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .single()

  if (!integration?.aktiv) {
    return NextResponse.json({ error: 'Google Calendar nicht verbunden' }, { status: 400 })
  }

  let accessToken = integration.access_token

  // Token ggf. erneuern
  if (new Date(integration.expires_at) < new Date()) {
    const refreshed = await refreshToken(integration.refresh_token)
    if (!refreshed) return NextResponse.json({ error: 'Token-Erneuerung fehlgeschlagen' }, { status: 401 })
    accessToken = refreshed.access_token
    await (supabaseAdmin as any).from('integrationen').update({
      access_token: refreshed.access_token,
      expires_at:   new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('id', integration.id)
  }

  // Dokumente mit Ausführungszeitraum laden
  const { data: dokumente } = await (supabaseAdmin as any)
    .from('dokumente')
    .select('id,typ,nummer,kunde_name,ausfuehrungszeitraum,gueltig_bis,brutto,status,created_at')
    .eq('user_id', userId)
    .not('ausfuehrungszeitraum', 'is', null)
    .in('status', ['offen','angenommen','entwurf'])
    .gte('created_at', new Date(Date.now() - 365*864e5).toISOString())

  let erstellt = 0; let fehler = 0

  for (const dok of dokumente || []) {
    try {
      const event = buildGoogleEvent(dok)
      if (!event) continue

      const res = await fetch(`${GOOGLE_CAL_URL}/calendars/primary/events`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(event),
      })

      if (res.ok) erstellt++
      else fehler++
    } catch { fehler++ }
  }

  return NextResponse.json({ success: true, erstellt, fehler, gesamt: (dokumente || []).length })
}

function buildGoogleEvent(dok: any): object | null {
  if (!dok.ausfuehrungszeitraum) return null

  const start = new Date()
  start.setHours(8, 0, 0, 0)
  const end = new Date(start)
  end.setHours(17, 0, 0, 0)

  return {
    summary:     `${dok.typ === 'angebot' ? 'Angebot' : 'Auftrag'}: ${dok.kunde_name}`,
    description: `${dok.typ.charAt(0).toUpperCase()+dok.typ.slice(1)} ${dok.nummer}\nAusführung: ${dok.ausfuehrungszeitraum}\nBetrag: ${Number(dok.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €`,
    start:       { date: start.toISOString().slice(0,10) },
    end:         { date: end.toISOString().slice(0,10) },
    source:      { title: 'Werkwort', url: `${process.env.NEXT_PUBLIC_APP_URL}/dokumente/${dok.id}` },
    extendedProperties: {
      private: { werkwort_id: dok.id, werkwort_typ: dok.typ }
    },
  }
}

async function refreshToken(refreshToken: string) {
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}
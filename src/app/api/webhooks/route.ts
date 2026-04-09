import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Wichtig: Raw body für Stripe Signatur-Prüfung
export const config = { api: { bodyParser: false } }

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

  // Im Testmodus ohne Webhook-Secret erlauben (für lokale Tests)
  let event: Stripe.Event

  if (process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET !== 'dein_key_hier') {
    try {
      event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (err: any) {
      console.error('Webhook Signatur Fehler:', err.message)
      return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 400 })
    }
  } else {
    // Testmodus: JSON direkt parsen
    try {
      event = JSON.parse(body) as Stripe.Event
    } catch {
      return NextResponse.json({ error: 'Ungültiger Body' }, { status: 400 })
    }
  }

  if (event.type === 'checkout.session.completed') {
   const session = event.data.object as Stripe.Checkout.Session

    const { user_id, token_menge, paket_id } = session.metadata || {}
    if (!user_id || !token_menge) {
      console.error('Fehlende Metadaten:', session.metadata)
      return NextResponse.json({ error: 'Fehlende Metadaten' }, { status: 400 })
    }

    const anzahl = parseInt(token_menge)
    console.log(`✅ Zahlung erhalten: ${anzahl} Token für User ${user_id}`)

    // Token gutschreiben
    const { error } = await (supabaseAdmin as any).rpc('gutschreibe_token', {
      p_user_id:        user_id,
      p_anzahl:         anzahl,
      p_beschreibung:   `Token-Kauf: Paket ${paket_id} (${anzahl} Token)`,
      p_stripe_session: session.id,
    })

    if (error) {
      console.error('Token gutschreiben fehlgeschlagen:', error)
      return NextResponse.json({ error: 'Token gutschreiben fehlgeschlagen' }, { status: 500 })
    }

    console.log(`✅ ${anzahl} Token gutgeschrieben für User ${user_id}`)
  }

  return NextResponse.json({ received: true })
}
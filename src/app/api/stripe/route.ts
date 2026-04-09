import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Webhook Signatur ungültig' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
  const session = event.data.object as Stripe.Checkout.Session
  const { user_id, token_menge } = session.metadata!

  await (supabaseAdmin as any).rpc('gutschreibe_token', {
    p_user_id: user_id,
    p_anzahl: parseInt(token_menge),
    p_beschreibung: `Token-Kauf via Stripe`,
    p_stripe_session: session.id,
  })
}

  return NextResponse.json({ received: true })
}
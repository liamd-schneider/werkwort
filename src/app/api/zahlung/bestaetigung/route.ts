import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Stripe: Kunde kommt nach erfolgreicher Zahlung hierher zurück
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId  = searchParams.get('session')
  const dokumentId = searchParams.get('dok')

  if (!sessionId || !dokumentId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?fehler=ungueltig`)
  }

  try {
    // Session von Stripe prüfen — wir brauchen den Connected Account
    const { data: dok } = await (supabaseAdmin as any)
      .from('dokumente').select('user_id,zahlung_session_id').eq('id', dokumentId).single()

    if (!dok) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?fehler=nicht_gefunden`)

    const { data: anbieter } = await (supabaseAdmin as any)
      .from('zahlungsanbieter')
      .select('stripe_account_id')
      .eq('user_id', dok.user_id).eq('provider', 'stripe').single()

    if (!anbieter?.stripe_account_id) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?fehler=kein_anbieter`)
    }

    // Session auf dem Connected Account verifizieren
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { stripeAccount: anbieter.stripe_account_id }
    )

    if (session.payment_status === 'paid') {
      await rechnungAlsBezahltMarkieren(dokumentId)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/zahlung/danke?dok=${dokumentId}&nr=${session.metadata?.rechnung_nr || ''}`
      )
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?fehler=zahlung_ausstehend`)

  } catch (err) {
    console.error('Bestätigung Fehler:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?fehler=server`)
  }
}

// ─── Hilfsfunktion: Rechnung als bezahlt markieren ──────────────
export async function rechnungAlsBezahltMarkieren(dokumentId: string) {
  await (supabaseAdmin as any).from('dokumente').update({
    status:     'bezahlt',
    updated_at: new Date().toISOString(),
  }).eq('id', dokumentId)
  console.log(`✅ Rechnung ${dokumentId} als bezahlt markiert`)
}
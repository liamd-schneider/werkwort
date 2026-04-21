import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendPushToUser } from '@/lib/send-push'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId  = searchParams.get('session')
  const dokumentId = searchParams.get('dok')

  if (!sessionId || !dokumentId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/zahlung/fehler`)
  }

  try {
    const { data: dok } = await (supabaseAdmin as any)
      .from('dokumente')
      .select('id,user_id,nummer,brutto,kunde_name')
      .eq('id', dokumentId)
      .single()

    if (!dok) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/zahlung/fehler`)

    const { data: anbieter } = await (supabaseAdmin as any)
      .from('zahlungsanbieter')
      .select('stripe_account_id')
      .eq('user_id', dok.user_id)
      .eq('provider', 'stripe')
      .single()

    if (!anbieter?.stripe_account_id) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/zahlung/fehler`)
    }

    // Stripe Session verifizieren
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      { stripeAccount: anbieter.stripe_account_id }
    )

    if (session.payment_status !== 'paid') {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/zahlung/fehler`)
    }

    // Rechnung auf bezahlt setzen
    await (supabaseAdmin as any).from('dokumente').update({
      status:     'bezahlt',
      updated_at: new Date().toISOString(),
    }).eq('id', dokumentId)

    // Notification für den Handwerker
    await (supabaseAdmin as any).from('notifications').insert({
      user_id: dok.user_id,
      typ:     'zahlung_eingegangen',
      titel:   'Zahlung eingegangen',
      text:    `${dok.kunde_name} hat Rechnung ${dok.nummer} über ${Number(dok.brutto).toLocaleString('de-DE', { minimumFractionDigits: 2 })} € bezahlt.`,
      link:    `/dokumente/${dokumentId}`,
      gelesen: false,
    })

    await sendPushToUser(dok.user_id, {
  titel: '💰 Zahlung eingegangen',
  text:  `${dok.kunde_name} hat Rechnung ${dok.nummer} bezahlt.`,
  link:  `/dokumente/${dokumentId}`,
})

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/zahlung/danke?nr=${encodeURIComponent(dok.nummer)}`
    )

  } catch (err) {
    console.error('Bestätigung Fehler:', err)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/zahlung/fehler`)
  }
}
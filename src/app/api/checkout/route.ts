import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Token-Mengen pro Paket
const PAKETE: Record<string, { token: number; name: string }> = {
  starter: { token: 25,  name: 'Werkwort Starter — 25 Token' },
  pro:     { token: 100, name: 'Werkwort Pro — 100 Token'     },
  team:    { token: 300, name: 'Werkwort Team — 300 Token'    },
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { paketId, priceId } = await req.json()
    const paket = PAKETE[paketId]
    if (!paket) return NextResponse.json({ error: 'Ungültiges Paket' }, { status: 400 })

    // Betrieb laden für E-Mail
    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe').select('email,name').eq('user_id', user.id).single()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: betrieb?.email || user.email || undefined,
      line_items: [{
        price: priceId, // Echte Stripe Price ID
        quantity: 1,
      }],
      metadata: {
        user_id:     user.id,
        paket_id:    paketId,
        token_menge: String(paket.token),
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/profil?success=1&paket=${paketId}&token=${paket.token}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/profil?canceled=1`,
      locale: 'de',
    })

    return NextResponse.json({ url: session.url })

  } catch (error: any) {
    console.error('Checkout Fehler:', error)
    // Stripe Fehler leserlich zurückgeben
    if (error?.type === 'StripeInvalidRequestError') {
      return NextResponse.json({ error: `Stripe Fehler: ${error.message}` }, { status: 400 })
    }
    return NextResponse.json({ error: 'Checkout fehlgeschlagen' }, { status: 500 })
  }
}
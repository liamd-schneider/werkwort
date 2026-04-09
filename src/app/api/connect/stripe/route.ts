import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // ── Status abfragen ──────────────────────────────────────────
  if (action === 'status') {
    const { data } = await (supabaseAdmin as any)
      .from('zahlungsanbieter')
      .select('stripe_account_id,stripe_account_status,stripe_charges_enabled,verbunden_am')
      .eq('user_id', user.id).eq('provider', 'stripe').single()

    if (!data?.stripe_account_id) return NextResponse.json({ verbunden: false })

    // Live-Status von Stripe holen
    try {
      const account = await stripe.accounts.retrieve(data.stripe_account_id)
      const aktiv   = account.charges_enabled && account.details_submitted

      // DB aktualisieren
      await (supabaseAdmin as any).from('zahlungsanbieter').update({
        stripe_account_status:  aktiv ? 'active' : 'pending',
        stripe_charges_enabled: account.charges_enabled,
        updated_at:             new Date().toISOString(),
      }).eq('user_id', user.id).eq('provider', 'stripe')

      return NextResponse.json({
        verbunden:        true,
        aktiv,
        account_id:       data.stripe_account_id,
        charges_enabled:  account.charges_enabled,
        details_submitted: account.details_submitted,
        email:            (account as any).email,
        verbunden_am:     data.verbunden_am,
      })
    } catch {
      return NextResponse.json({ verbunden: true, aktiv: false, fehler: 'Account nicht erreichbar' })
    }
  }

  // ── Onboarding-Link erstellen ────────────────────────────────
  if (action === 'connect') {
    try {
      // Betriebsdaten für den Account
      const { data: betrieb } = await (supabaseAdmin as any)
        .from('betriebe').select('name,email').eq('user_id', user.id).single()

      // Stripe Express Account anlegen (oder bestehenden laden)
      let { data: existing } = await (supabaseAdmin as any)
        .from('zahlungsanbieter')
        .select('stripe_account_id')
        .eq('user_id', user.id).eq('provider', 'stripe').single()

      let accountId = existing?.stripe_account_id

      if (!accountId) {
        const account = await stripe.accounts.create({
          type:    'express',
          country: 'DE',
          email:   betrieb?.email || undefined,
          capabilities: {
            card_payments:  { requested: true },
            transfers:      { requested: true },
            sepa_debit_payments: { requested: true },
          },
          business_type: 'individual',
          metadata: { werkwort_user_id: user.id },
        })
        accountId = account.id

        await (supabaseAdmin as any).from('zahlungsanbieter').upsert({
          user_id:              user.id,
          provider:             'stripe',
          stripe_account_id:    accountId,
          stripe_account_status: 'pending',
          aktiv:                true,
        }, { onConflict: 'user_id,provider' })
      }

      // Onboarding-Link generieren
      const link = await stripe.accountLinks.create({
        account:     accountId,
        refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/zahlungen?stripe=refresh`,
        return_url:  `${process.env.NEXT_PUBLIC_APP_URL}/zahlungen?stripe=verbunden`,
        type:        'account_onboarding',
      })

      return NextResponse.json({ url: link.url })

    } catch (err: any) {
      console.error('Stripe Connect Fehler:', err)
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  // ── Verbindung trennen ───────────────────────────────────────
  if (action === 'disconnect') {
    await (supabaseAdmin as any).from('zahlungsanbieter')
      .update({ aktiv: false, stripe_account_status: 'disconnected' })
      .eq('user_id', user.id).eq('provider', 'stripe')
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 })
}

// ── Zahlungslink für Rechnung erstellen ─────────────────────────
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { dokumentId } = await req.json()

  // Stripe Account des Handwerkers laden
  const { data: anbieter } = await (supabaseAdmin as any)
    .from('zahlungsanbieter')
    .select('stripe_account_id,stripe_charges_enabled')
    .eq('user_id', user.id).eq('provider', 'stripe').single()

  if (!anbieter?.stripe_account_id || !anbieter.stripe_charges_enabled) {
    return NextResponse.json({ error: 'Stripe nicht verbunden oder nicht aktiv' }, { status: 400 })
  }

  // Rechnung laden
  const { data: dok } = await (supabaseAdmin as any)
    .from('dokumente').select('*').eq('id', dokumentId).eq('user_id', user.id).single()
  if (!dok) return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 })

  const { data: betrieb } = await (supabaseAdmin as any)
    .from('betriebe').select('name').eq('user_id', user.id).single()

  try {
    // Payment Link über den Connected Account erstellen
    // Geld geht direkt an den Handwerker — wir nehmen keine Gebühr
    const session = await stripe.checkout.sessions.create(
      {
        mode:                 'payment',
        payment_method_types: ['card', 'sepa_debit'],
        line_items: [{
          price_data: {
            currency:     'eur',
            unit_amount:  Math.round(dok.brutto * 100),  // Cent
            product_data: {
              name:        `Rechnung ${dok.nummer} — ${betrieb?.name || ''}`,
              description: `${dok.kunde_name} · ${dok.positionen?.length || 0} Positionen`,
            },
          },
          quantity: 1,
        }],
        customer_email: undefined,
        metadata: {
          dokument_id:  dokumentId,
          user_id:      user.id,
          rechnung_nr:  dok.nummer,
        },
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/zahlung/bestaetigung?session={CHECKOUT_SESSION_ID}&dok=${dokumentId}`,
        cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL}/dokumente/${dokumentId}?zahlung=abgebrochen`,
      },
      {
        stripeAccount: anbieter.stripe_account_id,  // Direkt auf Konto des Handwerkers
      }
    )

    // Zahlungslink auf der Rechnung speichern
    await (supabaseAdmin as any).from('dokumente').update({
      zahlungslink:       session.url,
      zahlungsanbieter:   'stripe',
      zahlung_session_id: session.id,
    }).eq('id', dokumentId)

    return NextResponse.json({ success: true, url: session.url, session_id: session.id })

  } catch (err: any) {
    console.error('Stripe Payment Link Fehler:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
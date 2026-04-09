import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase-admin'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  let body: string
  let event: Stripe.Event

  try {
    // App Router: req.text() gibt den raw body zurück
    body = await req.text()
  } catch {
    return NextResponse.json({ error: 'Body lesen fehlgeschlagen' }, { status: 400 })
  }

  const sig = req.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  // Mit Signatur verifizieren falls Secret gesetzt
  if (webhookSecret && webhookSecret !== 'dein_key_hier' && webhookSecret !== '') {
    if (!sig) {
      console.error('Stripe Signatur fehlt')
      return NextResponse.json({ error: 'Signatur fehlt' }, { status: 400 })
    }
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
    } catch (err: any) {
      console.error('Webhook Signatur ungültig:', err.message)
      return NextResponse.json({ error: `Signatur ungültig: ${err.message}` }, { status: 400 })
    }
  } else {
    // Testmodus ohne Secret — direkt parsen
    try {
      event = JSON.parse(body) as Stripe.Event
      console.log('⚠️  Webhook ohne Signatur-Prüfung (Testmodus)')
    } catch {
      return NextResponse.json({ error: 'JSON ungültig' }, { status: 400 })
    }
  }

  console.log(`📨 Stripe Event: ${event.type}`)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log('Session metadata:', session.metadata)
    console.log('Payment status:', session.payment_status)

    // Nur bei bezahlten Sessions
    if (session.payment_status !== 'paid') {
      console.log('Session nicht bezahlt, überspringe')
      return NextResponse.json({ received: true })
    }

    const { user_id, token_menge, paket_id } = session.metadata || {}

    if (!user_id || !token_menge) {
      console.error('Fehlende Metadaten:', JSON.stringify(session.metadata))
      return NextResponse.json({ error: 'Fehlende Metadaten' }, { status: 400 })
    }

    const anzahl = parseInt(token_menge)
    console.log(`💰 Gutschreiben: ${anzahl} Token für User ${user_id}`)

    // Direkt mit supabaseAdmin (kein RPC nötig — direktes Update ist zuverlässiger)
    try {
      // 1. Aktuelles Guthaben lesen
      const { data: konto, error: readErr } = await (supabaseAdmin as any)
        .from('token_konten')
        .select('guthaben')
        .eq('user_id', user_id)
        .single()

      if (readErr) {
        console.error('Token-Konto nicht gefunden:', readErr)
        // Konto anlegen falls nicht vorhanden
        await (supabaseAdmin as any).from('token_konten').upsert({
          user_id, guthaben: anzahl
        }, { onConflict: 'user_id' })
      } else {
        // 2. Token addieren
        const neuesGuthaben = (konto.guthaben || 0) + anzahl
        const { error: updateErr } = await (supabaseAdmin as any)
          .from('token_konten')
          .update({ guthaben: neuesGuthaben, updated_at: new Date().toISOString() })
          .eq('user_id', user_id)

        if (updateErr) {
          console.error('Update fehlgeschlagen:', updateErr)
          return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
        }
        console.log(`✅ Neues Guthaben: ${neuesGuthaben} Token`)
      }

      // 3. Transaktion loggen
      await (supabaseAdmin as any).from('token_transaktionen').insert({
        user_id,
        betrag:         anzahl,
        beschreibung:   `Token-Kauf: ${paket_id} (${anzahl} Token)`,
        stripe_session: session.id,
      })

    } catch (err) {
      console.error('Datenbankfehler:', err)
      return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
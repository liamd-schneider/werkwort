// app/api/push-subscribe/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const subscription = await req.json()

  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Ungültige Subscription' }, { status: 400 })
  }

  const { error } = await (supabaseAdmin as any)
  .from('push_subscriptions')
  .upsert(
    { user_id: user.id, subscription },
    { onConflict: 'push_subscriptions_user_endpoint_idx' }
  )

  if (error) {
    console.error('Push subscription error:', error)
    return NextResponse.json({ error: 'Datenbankfehler' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { endpoint } = await req.json()

  await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('subscription->>endpoint', endpoint)

  return NextResponse.json({ success: true })
}
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { data } = await (supabaseAdmin as any)
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const ungelesen = (data || []).filter((n: any) => !n.gelesen).length

  return NextResponse.json({ notifications: data || [], ungelesen })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { action, id } = await req.json()

  // Alle als gelesen markieren
  if (action === 'alle_gelesen') {
    await (supabaseAdmin as any)
      .from('notifications')
      .update({ gelesen: true })
      .eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  // Einzelne als gelesen
  if (action === 'gelesen' && id) {
    await (supabaseAdmin as any)
      .from('notifications')
      .update({ gelesen: true })
      .eq('id', id)
      .eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 })
}
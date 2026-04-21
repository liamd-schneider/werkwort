import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import * as crypto from 'crypto'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { eintragsId } = await req.json()
  if (!eintragsId) return NextResponse.json({ error: 'eintragsId fehlt' }, { status: 400 })

  // Eintrag laden
  const { data: eintrag } = await (supabaseAdmin as any)
    .from('bautagebuch')
    .select('*')
    .eq('id', eintragsId)
    .eq('user_id', user.id)
    .single()

  if (!eintrag) return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  if (eintrag.finalisiert) return NextResponse.json({ error: 'Bereits finalisiert' }, { status: 400 })

  // SHA256-Hash aus Inhalt berechnen
  const inhalt = JSON.stringify({
    id:                   eintrag.id,
    datum:                eintrag.datum,
    baustelle:            eintrag.baustelle,
    arbeiter:             eintrag.arbeiter,
    ausgefuehrte_arbeiten: eintrag.ausgefuehrte_arbeiten,
    lieferungen:          eintrag.lieferungen,
    besuche:              eintrag.besuche,
    besonderheiten:       eintrag.besonderheiten,
    wetter:               eintrag.wetter,
    user_id:              eintrag.user_id,
    erfasst_am:           eintrag.erfasst_am || eintrag.created_at,
  })
  const hash    = crypto.createHash('sha256').update(inhalt, 'utf8').digest('hex')
  const jetzt   = new Date().toISOString()

  // Snapshot für Versionshistorie anlegen
  await (supabaseAdmin as any).from('bautagebuch_versionen').insert({
    eintrag_id:  eintragsId,
    user_id:     user.id,
    version:     eintrag.version || 1,
    grund:       'Erstfinalisierung (GoBD)',
    snapshot:    eintrag,
    hash_sha256: hash,
  })

  // Eintrag finalisieren
  await (supabaseAdmin as any).from('bautagebuch').update({
    finalisiert:     true,
    finalisiert_am:  jetzt,
    finalisiert_von: user.id,
    hash_sha256:     hash,
    version:         eintrag.version || 1,
  }).eq('id', eintragsId)

  return NextResponse.json({
    success:        true,
    hash:           hash,
    finalisiert_am: jetzt,
    version:        eintrag.version || 1,
  })
}

// GET: Versionen eines Eintrags laden
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const eintragsId = searchParams.get('id')
  if (!eintragsId) return NextResponse.json({ error: 'id fehlt' }, { status: 400 })

  const { data: versionen } = await (supabaseAdmin as any)
  .from('bautagebuch_versionen')
  .select('id,version,grund,hash_sha256,erstellt_am,snapshot')  // snapshot ergänzt
  .eq('eintrag_id', eintragsId)
  .eq('user_id', user.id)
  .order('version', { ascending: true })

  return NextResponse.json({ versionen: versionen || [] })
}

// ─── PATCH: Bearbeiten mit Versionierung ─────────────────────────
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { eintragsId, ausgefuehrte_arbeiten, lieferungen, besuche, besonderheiten, wetter, grund } = await req.json()

  const { data: eintrag } = await (supabaseAdmin as any)
    .from('bautagebuch').select('*').eq('id', eintragsId).eq('user_id', user.id).single()

  if (!eintrag) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })

  // Wenn finalisiert: Änderungsgrund Pflicht + neuen Versionsschnappschuss anlegen
  if (eintrag.finalisiert) {
    if (!grund?.trim()) return NextResponse.json({ error: 'Änderungsgrund erforderlich' }, { status: 400 })

    const neueVersion = (eintrag.version || 1) + 1
    const inhalt = JSON.stringify({ ...eintrag, ausgefuehrte_arbeiten, lieferungen, besuche, besonderheiten, wetter })
    const hash   = require('crypto').createHash('sha256').update(inhalt, 'utf8').digest('hex')

    // Aktuellen Zustand als Version archivieren
    await (supabaseAdmin as any).from('bautagebuch_versionen').insert({
      eintrag_id:  eintragsId,
      user_id:     user.id,
      version:     eintrag.version || 1,
      grund:       grund,
      snapshot:    eintrag,
      hash_sha256: eintrag.hash_sha256,
    })

    await (supabaseAdmin as any).from('bautagebuch').update({
      ausgefuehrte_arbeiten, lieferungen: lieferungen || null,
      besuche: besuche || null, besonderheiten: besonderheiten || null,
      wetter: wetter || null, version: neueVersion, hash_sha256: hash,
    }).eq('id', eintragsId)

    return NextResponse.json({ success: true, version: neueVersion })
  }

  // Nicht finalisiert: einfach speichern
  await (supabaseAdmin as any).from('bautagebuch').update({
    ausgefuehrte_arbeiten, lieferungen: lieferungen || null,
    besuche: besuche || null, besonderheiten: besonderheiten || null,
    wetter: wetter || null,
  }).eq('id', eintragsId)

  return NextResponse.json({ success: true, version: eintrag.version || 1 })
}
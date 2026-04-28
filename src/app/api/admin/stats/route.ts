import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Auth helper ────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

// ── Supabase service-role client (bypasses RLS) ────────────────────────────────
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Types ──────────────────────────────────────────────────────────────────────
type AuthUser = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
}

export interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  betrieb_name: string | null
  token_guthaben: number
  angebote: number
  rechnungen: number
  bauvertraege: number
  bautagebuecher: number
  finalisiert: number
  zugferd_rechnungen: number
  stripe_aktiv: boolean
  lexware_aktiv: boolean
  preisliste_hinterlegt: boolean
  team_mitglieder: number
  // per-user averages
  avg_bautagebuch_pro_tag: number
  avg_rechnungen_pro_woche: number
}

export interface DokumentTypCount {
  typ: string
  count: number
}

export interface TimeSeriesPoint {
  date: string
  value: number
}

export interface AdminStatsResponse {
  kpis: {
    gesamt_nutzer: number
    aktive_nutzer_7d: number
    gesamt_dokumente: number
    dokumente_nach_typ: DokumentTypCount[]
    gesamt_token_verbraucht: number
    gesamt_umsatz: number
    avg_dokumente_pro_nutzer: number
    avg_token_pro_nutzer: number
  }
  nutzer: UserRow[]
  aktivitaet: {
    avg_bautagebuch_pro_nutzer_30d: number
    avg_rechnungen_pro_nutzer_woche: number
    pct_stripe: number
    pct_lexware: number
    pct_preisliste: number
    pct_zugferd: number
    pct_bautagebuch: number
    top10_nutzer: { email: string; dokumente: number }[]
  }
  token_wirtschaft: {
    gesamt_guthaben: number
    gesamt_verbraucht: number
    avg_verbrauch_pro_dokument: number
    low_guthaben_nutzer: { email: string; guthaben: number }[]
  }
  zeitreihen: {
    neue_nutzer: TimeSeriesPoint[]
    dokumente_erstellt: TimeSeriesPoint[]
  }
  generated_at: string
}

// ── GET handler ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const now = new Date()
  const ago7d  = new Date(now.getTime() - 7  * 86400_000).toISOString()
  const ago30d = new Date(now.getTime() - 30 * 86400_000).toISOString()

  // ── 1. auth.users via SQL function ───────────────────────────────────────────
  const { data: users, error: usersErr } = await db
    .rpc('get_auth_users') as { data: AuthUser[] | null; error: unknown }

  if (usersErr || !users) {
    const msg = usersErr instanceof Error ? usersErr.message : JSON.stringify(usersErr)
    return NextResponse.json({ error: msg ?? 'users fetch failed' }, { status: 500 })
  }

  const gesamt_nutzer = users.length
  const aktive_nutzer_7d = users.filter(
    (u: AuthUser) => u.last_sign_in_at && u.last_sign_in_at >= ago7d
  ).length

  // ── 2. betriebe ──────────────────────────────────────────────────────────────
  const { data: betriebe } = await db
    .from('betriebe')
    .select('user_id, name')

  const betriebMap = new Map<string, string>()
  for (const b of betriebe ?? []) betriebMap.set(b.user_id, b.name)

  // ── 3. dokumente ─────────────────────────────────────────────────────────────
  const { data: dokumente } = await db
    .from('dokumente')
    .select('id, user_id, typ, status, brutto, token_verbraucht, finalisiert, zugferd_level, created_at')

  const docs = dokumente ?? []
  const gesamt_dokumente = docs.length

  const typMap: Record<string, number> = {}
  for (const d of docs) typMap[d.typ] = (typMap[d.typ] ?? 0) + 1
  const dokumente_nach_typ: DokumentTypCount[] = Object.entries(typMap).map(
    ([typ, count]) => ({ typ, count })
  )

  const gesamt_token_verbraucht = docs.reduce(
    (sum: number, d: { token_verbraucht?: number }) => sum + (d.token_verbraucht ?? 0), 0
  )

  const gesamt_umsatz = docs
    .filter((d: { typ: string; status: string }) => d.typ === 'rechnung' && d.status === 'bezahlt')
    .reduce((sum: number, d: { brutto?: number }) => sum + (d.brutto ?? 0), 0)

  const avg_dokumente_pro_nutzer = gesamt_nutzer > 0
    ? Math.round((gesamt_dokumente / gesamt_nutzer) * 100) / 100
    : 0

  // ── 4. token_konten ──────────────────────────────────────────────────────────
  const { data: tokenKonten } = await db
    .from('token_konten')
    .select('user_id, guthaben')

  const tokenMap = new Map<string, number>()
  let gesamt_guthaben = 0
  for (const t of tokenKonten ?? []) {
    tokenMap.set(t.user_id, t.guthaben ?? 0)
    gesamt_guthaben += t.guthaben ?? 0
  }

  const avg_token_pro_nutzer = gesamt_nutzer > 0
    ? Math.round((gesamt_guthaben / gesamt_nutzer) * 100) / 100
    : 0

  // ── 5. integrationen ─────────────────────────────────────────────────────────
  const { data: integrationen } = await db
    .from('integrationen')
    .select('user_id, provider, aktiv')

  const lexwareSet = new Set<string>()
  for (const i of integrationen ?? []) {
    if (i.provider === 'lexware' && i.aktiv) lexwareSet.add(i.user_id)
  }

  // ── 6. zahlungsanbieter ──────────────────────────────────────────────────────
  const { data: zahlungsanbieter } = await db
    .from('zahlungsanbieter')
    .select('user_id, aktiv')

  const stripeSet = new Set<string>()
  for (const z of zahlungsanbieter ?? []) {
    if (z.aktiv) stripeSet.add(z.user_id)
  }

  // ── 7. preispositionen ───────────────────────────────────────────────────────
  const { data: preispositionen } = await db
    .from('preispositionen')
    .select('user_id')

  const preisSet = new Set<string>()
  for (const p of preispositionen ?? []) preisSet.add(p.user_id)

  // ── 8. team_mitglieder ───────────────────────────────────────────────────────
  const { data: teamMitglieder } = await db
    .from('team_mitglieder')
    .select('betrieb_id, user_id, status')

  const { data: allBetriebe } = await db.from('betriebe').select('id, user_id')
  const betriebOwnerMap = new Map<string, string>()
  for (const b of allBetriebe ?? []) betriebOwnerMap.set(b.id, b.user_id)

  const teamCountMap = new Map<string, number>()
  for (const t of teamMitglieder ?? []) {
    if (t.status !== 'aktiv') continue
    const owner = betriebOwnerMap.get(t.betrieb_id)
    if (owner) teamCountMap.set(owner, (teamCountMap.get(owner) ?? 0) + 1)
  }

  // ── 9. bautagebuch ───────────────────────────────────────────────────────────
  const { data: bautagebuch } = await db
    .from('bautagebuch')
    .select('user_id, created_at')

  const btSet = new Set<string>()
  let btLast30 = 0

  // per-user bautagebuch counts (letzte 30 Tage)
  const btUserCount30d = new Map<string, number>()
  for (const b of bautagebuch ?? []) {
    btSet.add(b.user_id)
    if (b.created_at >= ago30d) {
      btLast30++
      btUserCount30d.set(b.user_id, (btUserCount30d.get(b.user_id) ?? 0) + 1)
    }
  }

  // ── 10. Per-Nutzer Rechnungen (letzte 30 Tage) ───────────────────────────────
  const rechnungUserCount30d = new Map<string, number>()
  for (const d of docs) {
    if (d.typ === 'rechnung' && d.created_at >= ago30d) {
      rechnungUserCount30d.set(d.user_id, (rechnungUserCount30d.get(d.user_id) ?? 0) + 1)
    }
  }

  // ── 11. Pro-Nutzer Dokument-Maps ─────────────────────────────────────────────
  type DocPerUser = {
    angebote: number; rechnungen: number
    bauvertraege: number; bautagebuecher: number
    finalisiert: number; zugferd: number
  }
  const docUserMap = new Map<string, DocPerUser>()
  const initDoc = (): DocPerUser => ({
    angebote: 0, rechnungen: 0, bauvertraege: 0,
    bautagebuecher: 0, finalisiert: 0, zugferd: 0,
  })

  for (const d of docs) {
    if (!docUserMap.has(d.user_id)) docUserMap.set(d.user_id, initDoc())
    const row = docUserMap.get(d.user_id)!
    if (d.typ === 'angebot')       row.angebote++
    if (d.typ === 'rechnung')      row.rechnungen++
    if (d.typ === 'bauvertrag')    row.bauvertraege++
    if (d.typ === 'bautagebuch')   row.bautagebuecher++
    if (d.finalisiert)             row.finalisiert++
    if (d.zugferd_level != null)   row.zugferd++
  }

  // ── 12. Nutzer-Tabelle zusammenbauen ─────────────────────────────────────────
  const nutzer: UserRow[] = users.map((u: AuthUser) => {
    const d = docUserMap.get(u.id) ?? initDoc()

    // Ø Bautagebuch pro Tag (letzte 30 Tage) für diesen Nutzer
    const btCount = btUserCount30d.get(u.id) ?? 0
    const avg_bautagebuch_pro_tag = Math.round((btCount / 30) * 100) / 100

    // Ø Rechnungen pro Woche (letzte 30 Tage) für diesen Nutzer
    const rCount = rechnungUserCount30d.get(u.id) ?? 0
    const avg_rechnungen_pro_woche = Math.round((rCount / 4.33) * 100) / 100

    return {
      id:                      u.id,
      email:                   u.email ?? '',
      created_at:              u.created_at,
      last_sign_in_at:         u.last_sign_in_at ?? null,
      betrieb_name:            betriebMap.get(u.id) ?? null,
      token_guthaben:          tokenMap.get(u.id) ?? 0,
      angebote:                d.angebote,
      rechnungen:              d.rechnungen,
      bauvertraege:            d.bauvertraege,
      bautagebuecher:          d.bautagebuecher,
      finalisiert:             d.finalisiert,
      zugferd_rechnungen:      d.zugferd,
      stripe_aktiv:            stripeSet.has(u.id),
      lexware_aktiv:           lexwareSet.has(u.id),
      preisliste_hinterlegt:   preisSet.has(u.id),
      team_mitglieder:         teamCountMap.get(u.id) ?? 0,
      avg_bautagebuch_pro_tag,
      avg_rechnungen_pro_woche,
    }
  })

  // ── 13. Aktivitäts-Stats ─────────────────────────────────────────────────────
  const pct = (set: Set<string>) =>
    gesamt_nutzer > 0 ? Math.round((set.size / gesamt_nutzer) * 1000) / 10 : 0

  const zugferdSet = new Set(docs.filter((d: { zugferd_level: unknown }) => d.zugferd_level != null).map((d: { user_id: string }) => d.user_id))

  const aktiveNutzer30d = new Set(
    users.filter((u: AuthUser) => u.last_sign_in_at && u.last_sign_in_at >= ago30d).map((u: AuthUser) => u.id)
  )
  const avg_bautagebuch_pro_nutzer_30d = aktiveNutzer30d.size > 0
    ? Math.round((btLast30 / aktiveNutzer30d.size) * 100) / 100
    : 0

  const rechnungen30d = docs.filter(
    (d: { typ: string; created_at: string }) => d.typ === 'rechnung' && d.created_at >= ago30d
  ).length
  const avg_rechnungen_pro_nutzer_woche = gesamt_nutzer > 0
    ? Math.round(((rechnungen30d / 4.33) / gesamt_nutzer) * 100) / 100
    : 0

  const top10_nutzer = [...docUserMap.entries()]
    .map(([uid, d]) => ({
      email: users.find((u: AuthUser) => u.id === uid)?.email ?? uid,
      dokumente: d.angebote + d.rechnungen + d.bauvertraege + d.bautagebuecher,
    }))
    .sort((a, b) => b.dokumente - a.dokumente)
    .slice(0, 10)

  // ── 14. Token-Wirtschaft ─────────────────────────────────────────────────────
  const avg_verbrauch_pro_dokument = gesamt_dokumente > 0
    ? Math.round((gesamt_token_verbraucht / gesamt_dokumente) * 100) / 100
    : 0

  const low_guthaben_nutzer = (tokenKonten ?? [])
    .filter((t: { guthaben?: number }) => (t.guthaben ?? 0) < 5)
    .map((t: { user_id: string; guthaben?: number }) => ({
      email: users.find((u: AuthUser) => u.id === t.user_id)?.email ?? t.user_id,
      guthaben: t.guthaben ?? 0,
    }))
    .sort((a: { guthaben: number }, b: { guthaben: number }) => a.guthaben - b.guthaben)

  // ── 15. Zeitreihen (letzte 30 Tage) ─────────────────────────────────────────
  const dateRange: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000)
    dateRange.push(d.toISOString().slice(0, 10))
  }

  const usersByDay = new Map<string, number>()
  for (const u of users) {
    const day = (u as AuthUser).created_at.slice(0, 10)
    if (dateRange.includes(day)) usersByDay.set(day, (usersByDay.get(day) ?? 0) + 1)
  }

  const docsByDay = new Map<string, number>()
  for (const d of docs) {
    const day = d.created_at.slice(0, 10)
    if (dateRange.includes(day)) docsByDay.set(day, (docsByDay.get(day) ?? 0) + 1)
  }

  const neue_nutzer: TimeSeriesPoint[] = dateRange.map(date => ({
    date,
    value: usersByDay.get(date) ?? 0,
  }))

  const dokumente_erstellt: TimeSeriesPoint[] = dateRange.map(date => ({
    date,
    value: docsByDay.get(date) ?? 0,
  }))

  // ── Response ─────────────────────────────────────────────────────────────────
  const payload: AdminStatsResponse = {
    kpis: {
      gesamt_nutzer,
      aktive_nutzer_7d,
      gesamt_dokumente,
      dokumente_nach_typ,
      gesamt_token_verbraucht,
      gesamt_umsatz,
      avg_dokumente_pro_nutzer,
      avg_token_pro_nutzer,
    },
    nutzer,
    aktivitaet: {
      avg_bautagebuch_pro_nutzer_30d,
      avg_rechnungen_pro_nutzer_woche,
      pct_stripe:      pct(stripeSet),
      pct_lexware:     pct(lexwareSet),
      pct_preisliste:  pct(preisSet),
      pct_zugferd:     pct(zugferdSet),
      pct_bautagebuch: pct(btSet),
      top10_nutzer,
    },
    token_wirtschaft: {
      gesamt_guthaben,
      gesamt_verbraucht: gesamt_token_verbraucht,
      avg_verbrauch_pro_dokument,
      low_guthaben_nutzer,
    },
    zeitreihen: {
      neue_nutzer,
      dokumente_erstellt,
    },
    generated_at: now.toISOString(),
  }

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
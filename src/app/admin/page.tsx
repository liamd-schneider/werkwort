'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { AdminStatsResponse, UserRow, TimeSeriesPoint } from '@/app/api/admin/stats/route'

// ── Auth ──────────────────────────────────────────────────────────────────────
const SECRET_KEY = 'ww_admin_secret'

function LoginScreen({ onLogin }: { onLogin: (s: string) => void }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState(false)

  const submit = async () => {
    const res = await fetch('/api/admin/stats', {
      headers: { 'x-admin-secret': val },
    })
    if (res.ok) {
      localStorage.setItem(SECRET_KEY, val)
      onLogin(val)
    } else {
      setErr(true)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f5f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Georgia', 'Times New Roman', serif",
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        padding: '48px',
        width: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 6 }}>
          Werkwort Admin
        </div>
        <div style={{ fontSize: 14, color: '#888', marginBottom: 32 }}>Internes Dashboard</div>
        <input
          type="password"
          placeholder="Admin-Passwort"
          value={val}
          onChange={e => { setVal(e.target.value); setErr(false) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{
            width: '100%',
            border: `1.5px solid ${err ? '#e53e3e' : '#ddd'}`,
            borderRadius: 6,
            padding: '11px 14px',
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            color: '#111',
            background: '#fafafa',
          }}
        />
        {err && <div style={{ color: '#e53e3e', fontSize: 13, marginTop: 8 }}>Falsches Passwort</div>}
        <button
          onClick={submit}
          style={{
            marginTop: 14,
            width: '100%',
            background: '#111',
            color: '#fff',
            border: 'none',
            padding: '12px 0',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Einloggen
        </button>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 0) {
  return n.toLocaleString('de-DE', { maximumFractionDigits: decimals })
}
function fmtEur(n: number) {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: boolean
}) {
  return (
    <div style={{
      background: highlight ? '#111' : '#fff',
      border: '1px solid #e5e5e5',
      borderRadius: 10,
      padding: '20px 22px',
      minWidth: 0,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ color: highlight ? '#aaa' : '#888', fontSize: 12, fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ color: highlight ? '#fff' : '#111', fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: -1 }}>
        {value}
      </div>
      {sub && <div style={{ color: highlight ? '#777' : '#aaa', fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ── Percent Bar ───────────────────────────────────────────────────────────────
function PctBar({ label, pct, color = '#111' }: { label: string; pct: number; color?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 13 }}>
        <span style={{ color: '#555' }}>{label}</span>
        <span style={{ color: '#111', fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3 }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
          transition: 'width 0.7s ease',
        }} />
      </div>
    </div>
  )
}

// ── Section Title ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: '#aaa',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 18,
      paddingBottom: 10,
      borderBottom: '1px solid #eee',
    }}>
      {children}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e5e5',
      borderRadius: 10,
      padding: '24px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Recharts Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e5e5',
      borderRadius: 8,
      padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      fontSize: 13,
    }}>
      <div style={{ color: '#888', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ color: '#555' }}>{p.name}:</span>
          <span style={{ color: '#111', fontWeight: 700 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── User Drawer ───────────────────────────────────────────────────────────────
function UserDrawer({ user, onClose }: { user: UserRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Row = ({ label, value, highlight }: {
    label: string; value: string | number | boolean; highlight?: 'green' | 'red'
  }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #f0f0f0',
    }}>
      <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: highlight === 'green' ? '#16a34a'
          : highlight === 'red' ? '#dc2626'
          : typeof value === 'boolean'
            ? (value ? '#16a34a' : '#ccc')
            : '#111',
      }}>
        {typeof value === 'boolean' ? (value ? '✓ Ja' : '— Nein') : value}
      </span>
    </div>
  )

  const totalDocs = user.angebote + user.rechnungen + user.bauvertraege + user.bautagebuecher

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 100,
          backdropFilter: 'blur(3px)',
        }}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 440,
        background: '#fff',
        borderLeft: '1px solid #e5e5e5',
        zIndex: 101,
        overflowY: 'auto',
        padding: '32px 28px',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div style={{ color: '#111', fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              {user.betrieb_name ?? 'Kein Betrieb'}
            </div>
            <div style={{ color: '#888', fontSize: 13 }}>{user.email}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#f5f5f5', border: 'none', color: '#555',
              padding: '7px 14px', cursor: 'pointer', borderRadius: 6,
              fontSize: 13, fontWeight: 500,
            }}
          >
            Schließen
          </button>
        </div>

        {/* Mini Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[
            { label: 'Dokumente', value: fmt(totalDocs) },
            { label: 'Token', value: fmt(user.token_guthaben) },
            { label: 'Ø BTB/Tag', value: fmt(user.avg_bautagebuch_pro_tag, 2) },
            { label: 'Ø Rech/Woche', value: fmt(user.avg_rechnungen_pro_woche, 2) },
          ].map(s => (
            <div key={s.label} style={{
              background: '#f8f8f8', borderRadius: 8, padding: '14px 16px',
            }}>
              <div style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{s.label}</div>
              <div style={{ color: '#111', fontSize: 20, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ color: '#bbb', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14 }}>
          Account
        </div>
        <Row label="Registriert" value={fmtDate(user.created_at)} />
        <Row label="Letzter Login" value={fmtDate(user.last_sign_in_at)} />
        <Row label="Token-Guthaben" value={fmt(user.token_guthaben)} highlight={user.token_guthaben < 5 ? 'red' : undefined} />

        <div style={{ color: '#bbb', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 24, marginBottom: 14 }}>
          Dokumente
        </div>
        <Row label="Angebote" value={user.angebote} />
        <Row label="Rechnungen" value={user.rechnungen} />
        <Row label="Bauverträge" value={user.bauvertraege} />
        <Row label="Bautagebücher" value={user.bautagebuecher} />
        <Row label="Finalisiert (GoBD)" value={user.finalisiert} highlight={user.finalisiert > 0 ? 'green' : undefined} />
        <Row label="ZUGFeRD-Rechnungen" value={user.zugferd_rechnungen} />

        <div style={{ color: '#bbb', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 24, marginBottom: 14 }}>
          Aktivität (30 Tage)
        </div>
        <Row label="Ø Bautagebücher / Tag" value={fmt(user.avg_bautagebuch_pro_tag, 2)} />
        <Row label="Ø Rechnungen / Woche" value={fmt(user.avg_rechnungen_pro_woche, 2)} />

        <div style={{ color: '#bbb', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 24, marginBottom: 14 }}>
          Integrationen & Features
        </div>
        <Row label="Stripe verbunden" value={user.stripe_aktiv} highlight={user.stripe_aktiv ? 'green' : undefined} />
        <Row label="Lexware verbunden" value={user.lexware_aktiv} highlight={user.lexware_aktiv ? 'green' : undefined} />
        <Row label="Preisliste hinterlegt" value={user.preisliste_hinterlegt} highlight={user.preisliste_hinterlegt ? 'green' : undefined} />
        <Row label="Team-Mitglieder (aktiv)" value={user.team_mitglieder} />
      </div>
    </>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
function Dashboard({ secret }: { secret: string }) {
  const [data, setData] = useState<AdminStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [sortCol, setSortCol] = useState<keyof UserRow>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const PAGE_SIZE = 25
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-secret': secret },
      })
      if (!res.ok) return
      const json: AdminStatsResponse = await res.json()
      setData(json)
      setLastUpdate(new Date())
    } finally {
      setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    fetchData()
    intervalRef.current = setInterval(fetchData, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchData])

  const handleSort = (col: keyof UserRow) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
    setPage(0)
  }

  const filteredUsers = (data?.nutzer ?? []).filter(u => {
    const q = search.toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      (u.betrieb_name ?? '').toLowerCase().includes(q)
    )
  }).sort((a, b) => {
    const av = a[sortCol] ?? 0
    const bv = b[sortCol] ?? 0
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE)
  const pagedUsers = filteredUsers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#888', fontSize: 15 }}>Daten werden geladen…</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#e53e3e', fontSize: 15 }}>Fehler beim Laden der Daten</div>
      </div>
    )
  }

  const { kpis, aktivitaet, token_wirtschaft, zeitreihen } = data

  const chartDataNutzer = zeitreihen.neue_nutzer.map((p: TimeSeriesPoint) => ({
    date: fmtShortDate(p.date),
    'Neue Nutzer': p.value,
  }))
  const chartDataDoks = zeitreihen.dokumente_erstellt.map((p: TimeSeriesPoint) => ({
    date: fmtShortDate(p.date),
    'Dokumente': p.value,
  }))

  const root: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f5f5f0',
    color: '#111',
    fontFamily: "'Georgia', 'Times New Roman', serif",
    fontSize: 14,
  }

  const th: React.CSSProperties = {
    textAlign: 'left',
    color: '#888',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    padding: '10px 12px',
    borderBottom: '2px solid #eee',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    background: '#fafafa',
  }

  const td: React.CSSProperties = {
    padding: '9px 12px',
    borderBottom: '1px solid #f0f0f0',
    whiteSpace: 'nowrap',
    fontSize: 13,
    color: '#333',
  }

  return (
    <div style={root}>
      {/* Header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e5e5e5',
        padding: '14px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Werkwort</span>
          <span style={{ color: '#ddd' }}>|</span>
          <span style={{ color: '#888', fontSize: 13 }}>Admin Dashboard</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdate && (
            <span style={{ color: '#aaa', fontSize: 12 }}>
              Aktualisiert {lastUpdate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 6px #16a34a' }} />
        </div>
      </div>

      <div style={{ padding: '32px', maxWidth: 1600, margin: '0 auto' }}>

        {/* KPIs */}
        <div style={{ marginBottom: 40 }}>
          <SectionTitle>Übersicht</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
            <StatCard label="Nutzer gesamt" value={fmt(kpis.gesamt_nutzer)} highlight />
            <StatCard
              label="Aktiv (7 Tage)"
              value={fmt(kpis.aktive_nutzer_7d)}
              sub={`${kpis.gesamt_nutzer > 0 ? Math.round(kpis.aktive_nutzer_7d / kpis.gesamt_nutzer * 100) : 0}% der Nutzer`}
            />
            <StatCard label="Dokumente" value={fmt(kpis.gesamt_dokumente)} />
            <StatCard
              label="Token verbraucht"
              value={fmt(kpis.gesamt_token_verbraucht)}
              sub={`Ø ${fmt(kpis.avg_token_pro_nutzer, 1)} / Nutzer`}
            />
            <StatCard
              label="Handwerker-Umsatz"
              value={fmtEur(kpis.gesamt_umsatz)}
              sub="bezahlte Rechnungen"
            />
            <StatCard
              label="Ø Dok. / Nutzer"
              value={fmt(kpis.avg_dokumente_pro_nutzer, 1)}
            />
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 40 }}>
          <Panel>
            <SectionTitle>Neue Nutzer / Tag (30 Tage)</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartDataNutzer} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#aaa' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#aaa' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="Neue Nutzer"
                  stroke="#111"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#111' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel>
            <SectionTitle>Dokumente erstellt / Tag (30 Tage)</SectionTitle>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartDataDoks} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#aaa' }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: '#aaa' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="Dokumente" fill="#111" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* Dokument-Typen + Feature-Adoption + Top 10 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 40 }}>
          <Panel>
            <SectionTitle>Dokument-Typen</SectionTitle>
            {kpis.dokumente_nach_typ.map(d => (
              <div key={d.typ} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '9px 0', borderBottom: '1px solid #f0f0f0',
              }}>
                <span style={{ color: '#555', textTransform: 'capitalize' }}>{d.typ}</span>
                <span style={{ color: '#111', fontWeight: 700 }}>{fmt(d.count)}</span>
              </div>
            ))}
          </Panel>

          <Panel>
            <SectionTitle>Feature-Adoption</SectionTitle>
            <PctBar label="Stripe verbunden" pct={aktivitaet.pct_stripe} color="#16a34a" />
            <PctBar label="Lexware verbunden" pct={aktivitaet.pct_lexware} color="#2563eb" />
            <PctBar label="Preisliste hinterlegt" pct={aktivitaet.pct_preisliste} color="#7c3aed" />
            <PctBar label="ZUGFeRD genutzt" pct={aktivitaet.pct_zugferd} color="#ea580c" />
            <PctBar label="Bautagebuch genutzt" pct={aktivitaet.pct_bautagebuch} color="#0891b2" />
          </Panel>

          <Panel>
            <SectionTitle>Top 10 Nutzer nach Dokumenten</SectionTitle>
            {aktivitaet.top10_nutzer.map((u, i) => (
              <div key={u.email} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 0', borderBottom: '1px solid #f0f0f0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#ccc', fontSize: 11, width: 18, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ color: '#555', fontSize: 12 }}>{u.email}</span>
                </div>
                <span style={{ color: '#111', fontWeight: 700 }}>{fmt(u.dokumente)}</span>
              </div>
            ))}
          </Panel>
        </div>

        {/* Token-Wirtschaft + Aktivitäts-Metriken */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 40 }}>
          <StatCard label="Token-Guthaben gesamt" value={fmt(token_wirtschaft.gesamt_guthaben)} />
          <StatCard label="Token verbraucht" value={fmt(token_wirtschaft.gesamt_verbraucht)} highlight />
          <StatCard label="Ø Verbrauch / Dokument" value={fmt(token_wirtschaft.avg_verbrauch_pro_dokument, 1)} />
          <Panel>
            <div style={{ color: '#aaa', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>
              Niedriges Guthaben (&lt;5)
            </div>
            {token_wirtschaft.low_guthaben_nutzer.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: 13 }}>Keine</div>
            ) : (
              token_wirtschaft.low_guthaben_nutzer.slice(0, 5).map(u => (
                <div key={u.email} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: '1px solid #f5f5f5',
                }}>
                  <span style={{ color: '#555', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '72%' }}>
                    {u.email}
                  </span>
                  <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13 }}>{u.guthaben}</span>
                </div>
              ))
            )}
            {token_wirtschaft.low_guthaben_nutzer.length > 5 && (
              <div style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
                +{token_wirtschaft.low_guthaben_nutzer.length - 5} weitere
              </div>
            )}
          </Panel>
        </div>

        {/* Aktivitäts-Metriken Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
          <StatCard
            label="Ø Bautagebücher / aktiver Nutzer (30d)"
            value={fmt(aktivitaet.avg_bautagebuch_pro_nutzer_30d, 2)}
          />
          <StatCard
            label="Ø Rechnungen / Nutzer / Woche"
            value={fmt(aktivitaet.avg_rechnungen_pro_nutzer_woche, 2)}
          />
        </div>

        {/* Nutzer-Tabelle */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SectionTitle>Nutzer ({fmt(filteredUsers.length)})</SectionTitle>
            <input
              placeholder="E-Mail oder Betrieb suchen…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              style={{
                background: '#fff',
                border: '1px solid #ddd',
                color: '#111',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                outline: 'none',
                width: 280,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {([
                      { label: 'E-Mail', col: 'email' },
                      { label: 'Betrieb', col: 'betrieb_name' },
                      { label: 'Reg.', col: 'created_at' },
                      { label: 'Login', col: 'last_sign_in_at' },
                      { label: 'Token', col: 'token_guthaben' },
                      { label: 'Ang.', col: 'angebote' },
                      { label: 'Rech.', col: 'rechnungen' },
                      { label: 'BV', col: 'bauvertraege' },
                      { label: 'BTB', col: 'bautagebuecher' },
                      { label: 'Final.', col: 'finalisiert' },
                      { label: 'ZUGFeRD', col: 'zugferd_rechnungen' },
                      { label: 'Ø BTB/Tag', col: 'avg_bautagebuch_pro_tag' },
                      { label: 'Ø Rech/Wo', col: 'avg_rechnungen_pro_woche' },
                      { label: 'Stripe', col: 'stripe_aktiv' },
                      { label: 'Lexw.', col: 'lexware_aktiv' },
                      { label: 'Preis', col: 'preisliste_hinterlegt' },
                      { label: 'Team', col: 'team_mitglieder' },
                    ] as { label: string; col: keyof UserRow }[]).map(h => (
                      <th
                        key={h.col}
                        style={{
                          ...th,
                          color: sortCol === h.col ? '#111' : '#aaa',
                        }}
                        onClick={() => handleSort(h.col)}
                      >
                        {h.label} {sortCol === h.col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u, i) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      style={{
                        cursor: 'pointer',
                        background: i % 2 === 0 ? '#fff' : '#fafafa',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0f7ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa')}
                    >
                      <td style={{ ...td, color: '#111', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.email}
                      </td>
                      <td style={{ ...td, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.betrieb_name ?? '—'}
                      </td>
                      <td style={{ ...td, color: '#aaa' }}>{fmtDate(u.created_at)}</td>
                      <td style={{ ...td, color: '#aaa' }}>{fmtDate(u.last_sign_in_at)}</td>
                      <td style={{ ...td, color: u.token_guthaben < 5 ? '#dc2626' : '#111', fontWeight: 700 }}>
                        {fmt(u.token_guthaben)}
                      </td>
                      <td style={td}>{u.angebote || '—'}</td>
                      <td style={td}>{u.rechnungen || '—'}</td>
                      <td style={td}>{u.bauvertraege || '—'}</td>
                      <td style={td}>{u.bautagebuecher || '—'}</td>
                      <td style={td}>{u.finalisiert || '—'}</td>
                      <td style={{ ...td, color: u.zugferd_rechnungen > 0 ? '#16a34a' : '#ccc', fontWeight: u.zugferd_rechnungen > 0 ? 700 : 400 }}>
                        {u.zugferd_rechnungen || '—'}
                      </td>
                      <td style={{ ...td, color: u.avg_bautagebuch_pro_tag > 0 ? '#111' : '#ccc' }}>
                        {u.avg_bautagebuch_pro_tag > 0 ? fmt(u.avg_bautagebuch_pro_tag, 2) : '—'}
                      </td>
                      <td style={{ ...td, color: u.avg_rechnungen_pro_woche > 0 ? '#111' : '#ccc' }}>
                        {u.avg_rechnungen_pro_woche > 0 ? fmt(u.avg_rechnungen_pro_woche, 2) : '—'}
                      </td>
                      <td style={td}>
                        <span style={{ color: u.stripe_aktiv ? '#16a34a' : '#ddd', fontWeight: 700 }}>
                          {u.stripe_aktiv ? '✓' : '—'}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{ color: u.lexware_aktiv ? '#2563eb' : '#ddd', fontWeight: 700 }}>
                          {u.lexware_aktiv ? '✓' : '—'}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{ color: u.preisliste_hinterlegt ? '#7c3aed' : '#ddd', fontWeight: 700 }}>
                          {u.preisliste_hinterlegt ? '✓' : '—'}
                        </span>
                      </td>
                      <td style={{ ...td, color: '#555' }}>{u.team_mitglieder || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px', borderTop: '1px solid #eee', background: '#fafafa',
              }}>
                <span style={{ color: '#aaa', fontSize: 12 }}>
                  Seite {page + 1} von {totalPages} · {fmt(filteredUsers.length)} Nutzer
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { label: '← Zurück', action: () => setPage(p => Math.max(0, p - 1)), disabled: page === 0 },
                    { label: 'Weiter →', action: () => setPage(p => Math.min(totalPages - 1, p + 1)), disabled: page === totalPages - 1 },
                  ].map(btn => (
                    <button
                      key={btn.label}
                      onClick={btn.action}
                      disabled={btn.disabled}
                      style={{
                        background: btn.disabled ? '#f5f5f5' : '#111',
                        border: 'none',
                        color: btn.disabled ? '#ccc' : '#fff',
                        padding: '6px 16px',
                        cursor: btn.disabled ? 'default' : 'pointer',
                        borderRadius: 6,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        fontWeight: 500,
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedUser && (
        <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(SECRET_KEY)
    if (stored) setSecret(stored)
  }, [])

  if (!secret) return <LoginScreen onLogin={setSecret} />
  return <Dashboard secret={secret} />
}
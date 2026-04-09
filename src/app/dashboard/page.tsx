'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Dokument, DokumentStatus } from '@/types'

interface Stats {
  offeneAngebote: number
  aktiveBaustellen: number
  ausstehendEuro: number
  tokenGuthaben: number
}

const STATUS_LABELS: Record<DokumentStatus, string> = {
  entwurf:    'Entwurf',
  offen:      'Offen',
  angenommen: 'Angenommen',
  bezahlt:    'Bezahlt',
  abgelehnt:  'Abgelehnt',
  ueberfaellig: 'Überfällig',
}

const STATUS_COLORS: Record<DokumentStatus, string> = {
  entwurf:      'bg-[#2a2a2a] text-[#888]',
  offen:        'bg-[#d4e840]/15 text-[#d4e840]',
  angenommen:   'bg-green-500/15 text-green-400',
  bezahlt:      'bg-green-500/15 text-green-400',
  abgelehnt:    'bg-red-500/15 text-red-400',
  ueberfaellig: 'bg-red-500/15 text-red-400',
}

const TYP_ICON: Record<string, string> = {
  angebot:     'A',
  rechnung:    'R',
  bauvertrag:  'V',
  bautagebuch: 'B',
}

const TYP_COLOR: Record<string, string> = {
  angebot:     'bg-[#d4e840]/15 text-[#d4e840]',
  rechnung:    'bg-green-500/15 text-green-400',
  bauvertrag:  'bg-blue-500/15 text-blue-400',
  bautagebuch: 'bg-teal-500/15 text-teal-400',
}

export default function DashboardPage() {
  const router = useRouter()
  const [betriebName, setBetriebName] = useState('')
  const [stats, setStats] = useState<Stats>({
    offeneAngebote: 0,
    aktiveBaustellen: 0,
    ausstehendEuro: 0,
    tokenGuthaben: 0,
  })
  const [letzteDokumente, setLetzteDokumente] = useState<Dokument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const [betriebRes, tokenRes, dokumenteRes, baustellenRes] = await Promise.all([
      (supabase as any).from('betriebe').select('name').eq('user_id', user.id).single(),
      (supabase as any).from('token_konten').select('guthaben').eq('user_id', user.id).single(),
      (supabase as any).from('dokumente')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
      (supabase as any).from('bautagebuch')
        .select('baustelle')
        .eq('user_id', user.id)
        .gte('datum', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
    ])

    if (betriebRes.data) setBetriebName(betriebRes.data.name)
    if (dokumenteRes.data) setLetzteDokumente(dokumenteRes.data)

    const alleDokumente = dokumenteRes.data || []
    const offeneAngebote = alleDokumente.filter(
      (d: Dokument) => d.typ === 'angebot' && d.status === 'offen'
    ).length
    const ausstehend = alleDokumente
      .filter((d: Dokument) => d.typ === 'rechnung' && d.status !== 'bezahlt')
      .reduce((sum: number, d: Dokument) => sum + d.brutto, 0)

    const baustellen = new Set(
      (baustellenRes.data || []).map((b: { baustelle: string }) => b.baustelle)
    ).size

    setStats({
      offeneAngebote,
      aktiveBaustellen: baustellen,
      ausstehendEuro: ausstehend,
      tokenGuthaben: tokenRes.data?.guthaben || 0,
    })

    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const stunde = new Date().getHours()
  const greeting = stunde < 12 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend'

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Top Bar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-light text-[#f0ede8]">werk</span>
          <span className="text-lg font-bold text-[#d4e840]">wort</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#555]">{betriebName}</span>
          <button onClick={handleLogout} className="text-xs text-[#444] hover:text-[#888] transition-colors">
            Ausloggen
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-medium">{greeting}</h1>
          <p className="text-[#555] text-sm mt-1">
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4">
            <div className="text-2xl font-semibold tabular-nums">{stats.offeneAngebote}</div>
            <div className="text-xs text-[#555] mt-1">Angebote offen</div>
          </div>
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4">
            <div className="text-2xl font-semibold tabular-nums">{stats.aktiveBaustellen}</div>
            <div className="text-xs text-[#555] mt-1">Baustellen aktiv</div>
          </div>
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4">
            <div className="text-2xl font-semibold tabular-nums text-[#d4e840]">
              {stats.ausstehendEuro.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €
            </div>
            <div className="text-xs text-[#555] mt-1">Ausstehend</div>
          </div>
        </div>

        {/* Schnellstart */}
        <div className="mb-8">
          <p className="text-xs text-[#444] uppercase tracking-widest mb-3">Schnellstart</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/neu"
              className="bg-[#d4e840] text-black font-medium py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>
              </svg>
              Neu erstellen
            </Link>
            <Link
              href="/bautagebuch"
              className="bg-[#181818] border border-[#2a2a2a] text-[#f0ede8] font-medium py-4 rounded-xl flex items-center justify-center gap-2 hover:border-[#444] transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>
              </svg>
              Tagebucheintrag
            </Link>
          </div>
        </div>

        {/* Token Stand */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4 mb-8">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-[#888]">Token-Guthaben</span>
            <span className="text-sm font-medium text-[#d4e840] tabular-nums">{stats.tokenGuthaben} Token</span>
          </div>
          <div className="bg-[#111] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-[#d4e840] rounded-full transition-all"
              style={{ width: `${Math.min((stats.tokenGuthaben / 100) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-3">
            <span className="text-xs text-[#444]">
              ~{Math.floor(stats.tokenGuthaben / 1.5)} Dokumente verbleibend
            </span>
            <Link href="/profil" className="text-xs text-[#d4e840] hover:opacity-75">
              Token kaufen →
            </Link>
          </div>
        </div>

        {/* Letzte Dokumente */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-[#444] uppercase tracking-widest">Zuletzt erstellt</p>
            <Link href="/dokumente" className="text-xs text-[#555] hover:text-[#888]">
              Alle anzeigen →
            </Link>
          </div>

          {letzteDokumente.length === 0 ? (
            <div className="bg-[#181818] border border-[#2a2a2a] border-dashed rounded-xl p-8 text-center">
              <p className="text-[#444] text-sm">Noch keine Dokumente</p>
              <Link href="/neu" className="text-[#d4e840] text-sm mt-2 block hover:opacity-75">
                Erstes Dokument erstellen →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {letzteDokumente.map((dok) => (
                <Link
                  key={dok.id}
                  href={`/dokumente/${dok.id}`}
                  className="bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center gap-3 hover:border-[#444] transition-all"
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${TYP_COLOR[dok.typ]}`}>
                    {TYP_ICON[dok.typ]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{dok.kunde_name}</div>
                    <div className="text-xs text-[#555] mt-0.5">
                      {dok.nummer} · {new Date(dok.created_at).toLocaleDateString('de-DE')}
                    </div>
                  </div>

                  {/* Betrag + Status */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium tabular-nums">
                      {dok.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${STATUS_COLORS[dok.status]}`}>
                      {STATUS_LABELS[dok.status]}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>

      

      {/* Bottom padding for nav */}
      <div className="h-24" />
    </div>
  )
}
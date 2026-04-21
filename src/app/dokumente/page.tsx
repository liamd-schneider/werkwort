'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Dokument, DokumentStatus, DokumentTyp } from '@/types'

const STATUS_LABELS: Record<DokumentStatus, string> = {
  entwurf:      'Entwurf',
  offen:        'Offen',
  gesendet:     'Gesendet',
  angenommen:   'Angenommen',
  bezahlt:      'Bezahlt',
  abgelehnt:    'Abgelehnt',
  ueberfaellig: 'Überfällig',
}

const STATUS_COLORS: Record<DokumentStatus, string> = {
  entwurf:      'bg-[#2a2a2a] text-[#888]',
  offen:        'bg-[#d4e840]/15 text-[#d4e840]',
  gesendet:     'bg-blue-500/15 text-blue-400',
  angenommen:   'bg-green-500/15 text-green-400',
  bezahlt:      'bg-green-500/15 text-green-400',
  abgelehnt:    'bg-red-500/15 text-red-400',
  ueberfaellig: 'bg-red-500/15 text-red-400',
}

const TYP_COLORS: Record<DokumentTyp, string> = {
  angebot:     'bg-[#d4e840]/15 text-[#d4e840]',
  rechnung:    'bg-green-500/15 text-green-400',
  bauvertrag:  'bg-blue-500/15 text-blue-400',
  bautagebuch: 'bg-teal-500/15 text-teal-400',
}

type Filter = 'alle' | DokumentTyp

const ZEITRAUM_OPTIONS = [
  { id: 'alle',     label: 'Alle Zeiträume' },
  { id: '7d',       label: 'Letzte 7 Tage' },
  { id: '30d',      label: 'Letzte 30 Tage' },
  { id: '90d',      label: 'Letzte 90 Tage' },
  { id: 'dieses_jahr', label: 'Dieses Jahr' },
  { id: 'letztes_jahr', label: 'Letztes Jahr' },
]

export default function DokumentePage() {
  const router = useRouter()
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('alle')
  const [suche, setSuche] = useState('')
  const [statusFilter, setStatusFilter] = useState<DokumentStatus | 'alle'>('alle')
  const [zeitraum, setZeitraum] = useState('alle')
  const [filterOffen, setFilterOffen] = useState(false)
  const [sortBy, setSortBy] = useState<'datum' | 'betrag' | 'kunde'>('datum')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  useEffect(() => { loadDokumente() }, [])

  const loadDokumente = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }
    const { data } = await (supabase as any)
      .from('dokumente')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setDokumente(data || [])
    setLoading(false)
  }

  const zeitraumFilter = (dok: Dokument) => {
    if (zeitraum === 'alle') return true
    const d = new Date(dok.created_at).getTime()
    const now = Date.now()
    const jahr = new Date().getFullYear()
    if (zeitraum === '7d')  return d >= now - 7  * 86400000
    if (zeitraum === '30d') return d >= now - 30 * 86400000
    if (zeitraum === '90d') return d >= now - 90 * 86400000
    if (zeitraum === 'dieses_jahr')  return new Date(dok.created_at).getFullYear() === jahr
    if (zeitraum === 'letztes_jahr') return new Date(dok.created_at).getFullYear() === jahr - 1
    return true
  }

  const gefiltert = dokumente
    .filter(d => filter === 'alle' || d.typ === filter)
    .filter(d => statusFilter === 'alle' || d.status === statusFilter)
    .filter(d => zeitraumFilter(d))
    .filter(d => {
      if (!suche) return true
      const s = suche.toLowerCase()
      return d.kunde_name.toLowerCase().includes(s) || d.nummer.toLowerCase().includes(s)
    })
    .sort((a, b) => {
      let va: any, vb: any
      if (sortBy === 'datum')  { va = new Date(a.created_at).getTime(); vb = new Date(b.created_at).getTime() }
      if (sortBy === 'betrag') { va = a.brutto; vb = b.brutto }
      if (sortBy === 'kunde')  { va = a.kunde_name.toLowerCase(); vb = b.kunde_name.toLowerCase() }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const aktiveFilter = [
    filter !== 'alle', statusFilter !== 'alle', zeitraum !== 'alle', suche !== ''
  ].filter(Boolean).length

  const filterTabs: { id: Filter; label: string }[] = [
    { id: 'alle',        label: 'Alle' },
    { id: 'angebot',     label: 'Angebote' },
    { id: 'rechnung',    label: 'Rechnungen' },
    { id: 'bauvertrag',  label: 'Verträge' },
    { id: 'bautagebuch', label: 'Tagebuch' },
  ]

  const SortIcon = ({ col }: { col: typeof sortBy }) => (
    <svg className={`w-3 h-3 inline ml-1 transition-opacity ${sortBy === col ? 'opacity-100' : 'opacity-20'}`}
      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      {sortBy === col && sortDir === 'asc'
        ? <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
        : <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>}
    </svg>
  )

  // Summen für gefilterte Dokumente
  const summe = gefiltert.reduce((s, d) => s + d.brutto, 0)

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Top Bar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Dokumente</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFilterOffen(v => !v)}
            className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-all ${
              filterOffen || aktiveFilter > 0
                ? 'bg-[#d4e840]/10 border-[#d4e840]/30 text-[#d4e840]'
                : 'bg-[#181818] border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'
            }`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" strokeLinecap="round"/>
            </svg>
            Filter
            {aktiveFilter > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#d4e840] text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {aktiveFilter}
              </span>
            )}
          </button>
          <Link href="/neu"
            className="bg-[#d4e840] text-black text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
            </svg>
            Neu
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Suche */}
        <div className="relative mb-4">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input type="text" value={suche} onChange={e => setSuche(e.target.value)}
            placeholder="Kunde oder Nummer suchen..."
            className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl pl-11 pr-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
          {suche && (
            <button type="button" onClick={() => setSuche('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Erweiterte Filter */}
        {filterOffen && (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-4 mb-4 space-y-4">
            {/* Status */}
            <div>
              <p className="text-xs text-[#444] uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setStatusFilter('alle')}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all ${statusFilter === 'alle' ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#111] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'}`}>
                  Alle
                </button>
                {(Object.keys(STATUS_LABELS) as DokumentStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${statusFilter === s ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#111] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'}`}>
                    {STATUS_LABELS[s]}
                    <span className="ml-1.5 opacity-50">{dokumente.filter(d => d.status === s).length}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Zeitraum */}
            <div>
              <p className="text-xs text-[#444] uppercase tracking-wider mb-2">Zeitraum</p>
              <div className="flex flex-wrap gap-2">
                {ZEITRAUM_OPTIONS.map(z => (
                  <button key={z.id} type="button" onClick={() => setZeitraum(z.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${zeitraum === z.id ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#111] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'}`}>
                    {z.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sortierung */}
            <div>
              <p className="text-xs text-[#444] uppercase tracking-wider mb-2">Sortierung</p>
              <div className="flex flex-wrap gap-2">
                {([['datum','Datum'],['betrag','Betrag'],['kunde','Kunde']] as const).map(([col, label]) => (
                  <button key={col} type="button" onClick={() => toggleSort(col)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1 ${sortBy === col ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#111] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'}`}>
                    {label}
                    {sortBy === col && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        {sortDir === 'asc'
                          ? <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
                          : <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>}
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {aktiveFilter > 0 && (
              <button type="button" onClick={() => { setStatusFilter('alle'); setZeitraum('alle'); setSuche(''); setFilter('alle') }}
                className="text-xs text-red-400/70 hover:text-red-400 transition-colors">
                ✕ Alle Filter zurücksetzen
              </button>
            )}
          </div>
        )}

        {/* Typ Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {filterTabs.map(tab => (
            <button key={tab.id} type="button" onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
                filter === tab.id ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#181818] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'
              }`}>
              {tab.label}
              {tab.id !== 'alle' && (
                <span className="ml-1.5 text-xs opacity-60">
                  {dokumente.filter(d => d.typ === tab.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Ergebnis-Info */}
        {!loading && gefiltert.length > 0 && (
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-xs text-[#444]">
              {gefiltert.length} Dokument{gefiltert.length !== 1 ? 'e' : ''}
              {aktiveFilter > 0 ? ' gefunden' : ''}
            </p>
            <p className="text-xs text-[#555] tabular-nums">
              Gesamt: <span className="text-[#888]">{summe.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span>
            </p>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : gefiltert.length === 0 ? (
          <div className="border border-dashed border-[#2a2a2a] rounded-2xl p-16 text-center">
            <p className="text-[#444] mb-3">
              {aktiveFilter > 0 ? 'Keine Dokumente für diese Filter' : 'Keine Dokumente gefunden'}
            </p>
            {aktiveFilter > 0 ? (
              <button type="button" onClick={() => { setStatusFilter('alle'); setZeitraum('alle'); setSuche(''); setFilter('alle') }}
                className="text-[#d4e840] text-sm hover:opacity-75">Filter zurücksetzen</button>
            ) : (
              <Link href="/neu" className="text-[#d4e840] text-sm hover:opacity-75">Erstes Dokument erstellen →</Link>
            )}
          </div>
        ) : (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            {/* Tabellenkopf */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-[#2a2a2a] text-xs text-[#444] uppercase tracking-wider">
              <div className="col-span-1">Typ</div>
              <div className="col-span-2">Nummer</div>
              <button type="button" onClick={() => toggleSort('kunde')}
                className="col-span-4 text-left hover:text-[#888] transition-colors">
                Kunde <SortIcon col="kunde"/>
              </button>
              <button type="button" onClick={() => toggleSort('datum')}
                className="col-span-2 text-left hover:text-[#888] transition-colors">
                Datum <SortIcon col="datum"/>
              </button>
              <button type="button" onClick={() => toggleSort('betrag')}
                className="col-span-2 text-right hover:text-[#888] transition-colors w-full">
                Betrag <SortIcon col="betrag"/>
              </button>
              <div className="col-span-1 text-right">Status</div>
            </div>

            {gefiltert.map((dok, i) => (
              <Link key={dok.id} href={`/dokumente/${dok.id}`}
                className={`flex md:grid md:grid-cols-12 gap-4 items-center px-5 py-4 hover:bg-[#1f1f1f] transition-colors ${
                  i !== gefiltert.length - 1 ? 'border-b border-[#1f1f1f]' : ''
                }`}>
                <div className="col-span-1">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${TYP_COLORS[dok.typ as DokumentTyp]}`}>
                    {dok.typ.slice(0,1).toUpperCase()}
                  </span>
                </div>
                <div className="col-span-2 font-mono text-sm text-[#888] hidden md:block">{dok.nummer}</div>
                <div className="col-span-4 flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{dok.kunde_name}</div>
                  <div className="text-xs text-[#555] mt-0.5 md:hidden">{dok.nummer}</div>
                </div>
                <div className="col-span-2 text-sm text-[#555] hidden md:block">
                  {new Date(dok.created_at).toLocaleDateString('de-DE')}
                </div>
                <div className="col-span-2 text-sm font-medium tabular-nums text-right">
                  {dok.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </div>
                <div className="col-span-1 flex justify-end">
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_COLORS[dok.status as DokumentStatus]}`}>
                    {STATUS_LABELS[dok.status as DokumentStatus]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="h-24 md:h-8"/>
    </div>
  )
}
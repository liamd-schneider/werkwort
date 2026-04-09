'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Dokument, DokumentStatus, DokumentTyp } from '@/types'

const STATUS_LABELS: Record<DokumentStatus, string> = {
  entwurf:      'Entwurf',
  offen:        'Offen',
  angenommen:   'Angenommen',
  bezahlt:      'Bezahlt',
  abgelehnt:    'Abgelehnt',
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

const TYP_COLORS: Record<DokumentTyp, string> = {
  angebot:     'bg-[#d4e840]/15 text-[#d4e840]',
  rechnung:    'bg-green-500/15 text-green-400',
  bauvertrag:  'bg-blue-500/15 text-blue-400',
  bautagebuch: 'bg-teal-500/15 text-teal-400',
}

type Filter = 'alle' | DokumentTyp

export default function DokumentePage() {
  const router = useRouter()
  const [dokumente, setDokumente] = useState<Dokument[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('alle')
  const [suche, setSuche] = useState('')

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

  const gefiltert = dokumente.filter(d => {
    const typMatch = filter === 'alle' || d.typ === filter
    const sucheMatch = suche === '' ||
      d.kunde_name.toLowerCase().includes(suche.toLowerCase()) ||
      d.nummer.toLowerCase().includes(suche.toLowerCase())
    return typMatch && sucheMatch
  })

  const filterTabs: { id: Filter; label: string }[] = [
    { id: 'alle',        label: 'Alle' },
    { id: 'angebot',     label: 'Angebote' },
    { id: 'rechnung',    label: 'Rechnungen' },
    { id: 'bauvertrag',  label: 'Verträge' },
    { id: 'bautagebuch', label: 'Tagebuch' },
  ]

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Top Bar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Dokumente</h1>
        <Link
          href="/neu"
          className="bg-[#d4e840] text-black text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
          </svg>
          Neu
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">

        {/* Suche */}
        <div className="relative mb-4">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Kunde oder Nummer suchen..."
            className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl pl-11 pr-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {filterTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
                filter === tab.id
                  ? 'bg-[#d4e840] text-black font-medium'
                  : 'bg-[#181818] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'
              }`}
            >
              {tab.label}
              {tab.id !== 'alle' && (
                <span className="ml-1.5 text-xs opacity-60">
                  {dokumente.filter(d => d.typ === tab.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Liste */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/>
          </div>
        ) : gefiltert.length === 0 ? (
          <div className="border border-dashed border-[#2a2a2a] rounded-2xl p-16 text-center">
            <p className="text-[#444] mb-3">Keine Dokumente gefunden</p>
            <Link href="/neu" className="text-[#d4e840] text-sm hover:opacity-75">
              Erstes Dokument erstellen →
            </Link>
          </div>
        ) : (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            {/* Tabellenkopf — nur Desktop */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-[#2a2a2a] text-xs text-[#444] uppercase tracking-wider">
              <div className="col-span-1">Typ</div>
              <div className="col-span-2">Nummer</div>
              <div className="col-span-4">Kunde</div>
              <div className="col-span-2">Datum</div>
              <div className="col-span-2 text-right">Betrag</div>
              <div className="col-span-1 text-right">Status</div>
            </div>

            {gefiltert.map((dok, i) => (
              <Link
                key={dok.id}
                href={`/dokumente/${dok.id}`}
                className={`flex md:grid md:grid-cols-12 gap-4 items-center px-5 py-4 hover:bg-[#1f1f1f] transition-colors ${
                  i !== gefiltert.length - 1 ? 'border-b border-[#1f1f1f]' : ''
                }`}
              >
                {/* Typ Badge */}
                <div className="col-span-1">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md ${TYP_COLORS[dok.typ as DokumentTyp]}`}>
                    {dok.typ.slice(0,1).toUpperCase()}
                  </span>
                </div>

                {/* Nummer */}
                <div className="col-span-2 font-mono text-sm text-[#888] hidden md:block">
                  {dok.nummer}
                </div>

                {/* Kunde */}
                <div className="col-span-4 flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{dok.kunde_name}</div>
                  <div className="text-xs text-[#555] mt-0.5 md:hidden">{dok.nummer}</div>
                </div>

                {/* Datum */}
                <div className="col-span-2 text-sm text-[#555] hidden md:block">
                  {new Date(dok.created_at).toLocaleDateString('de-DE')}
                </div>

                {/* Betrag */}
                <div className="col-span-2 text-sm font-medium tabular-nums text-right">
                  {dok.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                </div>

                {/* Status */}
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

      {/* Padding für Bottom Nav auf Mobile */}
      <div className="h-24 md:h-8"/>
    </div>
  )
}
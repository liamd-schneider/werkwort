'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Stats {
  anzahl: number; sumNetto: number; sumMwst: number; sumBrutto: number
  bezahlt: number; offen: number; ueberfaellig: number
}

export default function ExportPage() {
  const router = useRouter()
  const [stats, setStats]             = useState<Stats | null>(null)
  const [statsLoading, setStatsLoad]  = useState(true)
  const [exportLoading, setExpLoad]   = useState(false)
  const [protokollLoad, setProtLoad]  = useState(false)

  const jetzt = new Date()
  const [vonDatum, setVon]            = useState(`${jetzt.getFullYear()}-${String(jetzt.getMonth()+1).padStart(2,'0')}-01`)
  const [bisDatum, setBis]            = useState(jetzt.toISOString().slice(0,10))
  const [skr, setSkr]                 = useState<'SKR03'|'SKR04'>('SKR03')
  const [festschreibung, setFest]     = useState(false)
  const [mitZahlungen, setZahlungen]  = useState(false)

  // Schnellauswahl
  const zeitraeume = [
    { label: `${jetzt.getFullYear()} gesamt`, von: `${jetzt.getFullYear()}-01-01`, bis: `${jetzt.getFullYear()}-12-31` },
    { label: `${jetzt.getFullYear()-1}`,      von: `${jetzt.getFullYear()-1}-01-01`, bis: `${jetzt.getFullYear()-1}-12-31` },
    { label: 'Jan', von: `${jetzt.getFullYear()}-01-01`, bis: `${jetzt.getFullYear()}-01-31` },
    { label: 'Feb', von: `${jetzt.getFullYear()}-02-01`, bis: `${jetzt.getFullYear()}-02-28` },
    { label: 'Mär', von: `${jetzt.getFullYear()}-03-01`, bis: `${jetzt.getFullYear()}-03-31` },
    { label: 'Apr', von: `${jetzt.getFullYear()}-04-01`, bis: `${jetzt.getFullYear()}-04-30` },
    { label: 'Mai', von: `${jetzt.getFullYear()}-05-01`, bis: `${jetzt.getFullYear()}-05-31` },
    { label: 'Jun', von: `${jetzt.getFullYear()}-06-01`, bis: `${jetzt.getFullYear()}-06-30` },
    { label: 'Jul', von: `${jetzt.getFullYear()}-07-01`, bis: `${jetzt.getFullYear()}-07-31` },
    { label: 'Aug', von: `${jetzt.getFullYear()}-08-01`, bis: `${jetzt.getFullYear()}-08-31` },
    { label: 'Sep', von: `${jetzt.getFullYear()}-09-01`, bis: `${jetzt.getFullYear()}-09-30` },
    { label: 'Okt', von: `${jetzt.getFullYear()}-10-01`, bis: `${jetzt.getFullYear()}-10-31` },
    { label: 'Nov', von: `${jetzt.getFullYear()}-11-01`, bis: `${jetzt.getFullYear()}-11-30` },
    { label: 'Dez', von: `${jetzt.getFullYear()}-12-01`, bis: `${jetzt.getFullYear()}-12-31` },
    { label: 'Q1',  von: `${jetzt.getFullYear()}-01-01`, bis: `${jetzt.getFullYear()}-03-31` },
    { label: 'Q2',  von: `${jetzt.getFullYear()}-04-01`, bis: `${jetzt.getFullYear()}-06-30` },
    { label: 'Q3',  von: `${jetzt.getFullYear()}-07-01`, bis: `${jetzt.getFullYear()}-09-30` },
    { label: 'Q4',  von: `${jetzt.getFullYear()}-10-01`, bis: `${jetzt.getFullYear()}-12-31` },
  ]

  useEffect(() => { ladeStats() }, [vonDatum, bisDatum])

  const ladeStats = async () => {
    setStatsLoad(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const { data } = await (supabase as any)
      .from('dokumente')
      .select('netto,mwst,brutto,status,created_at')
      .eq('user_id', user.id)
      .in('typ', ['rechnung', 'bauvertrag'])
      .in('status', ['offen','bezahlt','ueberfaellig','angenommen'])
      .gte('created_at', vonDatum + 'T00:00:00')
      .lte('created_at', bisDatum + 'T23:59:59')

    if (data && data.length > 0) {
      setStats({
        anzahl:       data.length,
        sumNetto:     data.reduce((s: number, r: any) => s + Number(r.netto),  0),
        sumMwst:      data.reduce((s: number, r: any) => s + Number(r.mwst),   0),
        sumBrutto:    data.reduce((s: number, r: any) => s + Number(r.brutto), 0),
        bezahlt:      data.filter((r: any) => r.status === 'bezahlt').length,
        offen:        data.filter((r: any) => r.status === 'offen').length,
        ueberfaellig: data.filter((r: any) => r.status === 'ueberfaellig').length,
      })
    } else {
      setStats(null)
    }
    setStatsLoad(false)
  }

  const buildUrl = (extra = '') => {
    const base = `/api/export/datev?von=${vonDatum}&bis=${bisDatum}&skr=${skr}&fest=${festschreibung?'1':'0'}&zahlungen=${mitZahlungen?'1':'0'}`
    return base + extra
  }

  const exportieren = async () => {
    setExpLoad(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(buildUrl(), {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Export fehlgeschlagen'); return }
      const blob     = await res.blob()
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'datev.csv'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = filename; a.click()
      URL.revokeObjectURL(a.href)
    } finally { setExpLoad(false) }
  }

  const protokollOeffnen = async () => {
    setProtLoad(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(buildUrl('&protokoll=1'), {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      if (!res.ok) { alert('Fehler'); return }
      const html = await res.text()
      const blob = new Blob([html], { type: 'text/html' })
      window.open(URL.createObjectURL(blob), '_blank')
    } finally { setProtLoad(false) }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-3">
        <Link href="/dokumente" className="text-[#555] hover:text-[#888] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <h1 className="text-lg font-medium">DATEV Export</h1>
        <span className="text-xs bg-[#d4e840]/15 text-[#d4e840] px-2.5 py-1 rounded-full">Buchungsstapel Ascii v700</span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ─── Zeitraum ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Zeitraum</p>

          {/* Monats-Schnellauswahl */}
          <div className="mb-4">
            <p className="text-xs text-[#333] mb-2">Monat wählen</p>
            <div className="flex gap-1.5 flex-wrap">
              {zeitraeume.slice(2, 14).map(z => (
                <button key={z.label} type="button"
                  onClick={() => { setVon(z.von); setBis(z.bis) }}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                    vonDatum === z.von && bisDatum === z.bis
                      ? 'bg-[#d4e840] text-black font-medium'
                      : 'bg-[#111] border border-[#2a2a2a] text-[#888] hover:border-[#444]'
                  }`}>{z.label}</button>
              ))}
            </div>
          </div>

          {/* Quartal + Jahres-Auswahl */}
          <div className="flex gap-1.5 flex-wrap mb-5">
            {[...zeitraeume.slice(0,2), ...zeitraeume.slice(14)].map(z => (
              <button key={z.label} type="button"
                onClick={() => { setVon(z.von); setBis(z.bis) }}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                  vonDatum === z.von && bisDatum === z.bis
                    ? 'bg-[#d4e840] text-black font-medium'
                    : 'bg-[#111] border border-[#2a2a2a] text-[#888] hover:border-[#444]'
                }`}>{z.label}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Von</label>
              <input type="date" value={vonDatum} onChange={e => setVon(e.target.value)}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:outline-none focus:border-[#d4e840] transition-colors [color-scheme:dark]"/>
            </div>
            <div>
              <label className="text-xs text-[#666] mb-1.5 block">Bis</label>
              <input type="date" value={bisDatum} onChange={e => setBis(e.target.value)}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:outline-none focus:border-[#d4e840] transition-colors [color-scheme:dark]"/>
            </div>
          </div>
        </div>

        {/* ─── DATEV-Einstellungen ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Einstellungen</p>
          <div className="space-y-4">

            {/* Kontenrahmen */}
            <div>
              <p className="text-sm font-medium mb-2">Kontenrahmen</p>
              <div className="grid grid-cols-2 gap-2">
                {(['SKR03','SKR04'] as const).map(k => (
                  <button key={k} type="button" onClick={() => setSkr(k)}
                    className={`p-3 rounded-xl border text-left transition-all ${skr === k ? 'border-[#d4e840] bg-[#d4e840]/10' : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'}`}>
                    <p className="font-medium text-sm">{k}</p>
                    <p className="text-xs text-[#555] mt-0.5">
                      {k === 'SKR03'
                        ? 'Forderungen 1400 · Erlöse 8400/8300 · Standard Handwerk'
                        : 'Forderungen 1200 · Erlöse 4400/4300 · Industrie/GmbH'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Zahlungseingänge */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#444] transition-all">
              <input type="checkbox" checked={mitZahlungen} onChange={e => setZahlungen(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#d4e840]"/>
              <div>
                <p className="text-sm font-medium">Zahlungseingänge einschließen</p>
                <p className="text-xs text-[#555] mt-0.5">
                  Erzeugt zusätzliche Buchungssätze für bezahlte Rechnungen ({skr === 'SKR03' ? '1200' : '1800'} Bank an {skr === 'SKR03' ? '1400' : '1200'} Forderungen). Empfohlen für vollständige OPOS-Abstimmung.
                </p>
              </div>
            </label>

            {/* Festschreibung */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#444] transition-all">
              <input type="checkbox" checked={festschreibung} onChange={e => setFest(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#d4e840]"/>
              <div>
                <p className="text-sm font-medium">Festschreibung aktivieren</p>
                <p className="text-xs text-[#555] mt-0.5">
                  Setzt Feld 21 im Vorlaufsatz auf "1". Buchungen werden nach dem Import in DATEV gesperrt und können nicht mehr verändert werden. Nur für DATEV Unternehmen online / bei abgestimmten Perioden setzen.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* ─── Vorschau ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Vorschau</p>
          {statsLoading ? (
            <div className="flex items-center gap-3 text-[#555] text-sm py-4">
              <div className="w-4 h-4 border-2 border-[#444] border-t-transparent rounded-full animate-spin"/>
              Lade Daten...
            </div>
          ) : !stats ? (
            <div className="text-center py-8">
              <p className="text-[#444] text-sm">Keine Rechnungen im gewählten Zeitraum</p>
              <p className="text-xs text-[#333] mt-1">Nur gesendete Rechnungen werden exportiert (keine Entwürfe)</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#111] rounded-xl p-4 text-center">
                  <p className="text-2xl font-semibold tabular-nums">{stats.anzahl}</p>
                  <p className="text-xs text-[#555] mt-1">Buchungen</p>
                </div>
                <div className="bg-[#111] rounded-xl p-4 text-center">
                  <p className="text-2xl font-semibold tabular-nums text-[#888]">
                    {stats.sumNetto.toLocaleString('de-DE',{minimumFractionDigits:2})} €
                  </p>
                  <p className="text-xs text-[#555] mt-1">Netto</p>
                </div>
                <div className="bg-[#111] rounded-xl p-4 text-center">
                  <p className="text-2xl font-semibold tabular-nums text-[#d4e840]">
                    {stats.sumBrutto.toLocaleString('de-DE',{minimumFractionDigits:2})} €
                  </p>
                  <p className="text-xs text-[#555] mt-1">Brutto</p>
                </div>
              </div>

              <div className="flex gap-3 text-xs">
                <span className="text-green-400">{stats.bezahlt} bezahlt</span>
                <span className="text-[#555]">·</span>
                <span className="text-[#d4e840]">{stats.offen} offen</span>
                {stats.ueberfaellig > 0 && <><span className="text-[#555]">·</span><span className="text-red-400">{stats.ueberfaellig} überfällig</span></>}
                {mitZahlungen && stats.bezahlt > 0 && <><span className="text-[#555]">·</span><span className="text-[#888]">{stats.bezahlt} Zahlungseingänge erzeugt</span></>}
              </div>

              <div className="bg-[#d4e840]/5 border border-[#d4e840]/20 rounded-xl p-4 text-xs text-[#888] leading-relaxed">
                <p className="text-[#d4e840] font-medium mb-1">Export-Info</p>
                Kontenrahmen {skr} · Ausgangsrechnungen: {skr === 'SKR03' ? '1400' : '1200'} an {skr === 'SKR03' ? '8400' : '4400'} · Buchungszeitraum wird automatisch aus den tatsächlichen Belegdaten gesetzt{festschreibung ? ' · Festschreibung aktiv' : ''}{mitZahlungen ? ` · ${stats.bezahlt} Zahlungsbuchungen` : ''}
              </div>
            </div>
          )}
        </div>

        {/* ─── Aktionen ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button type="button" onClick={protokollOeffnen}
            disabled={protokollLoad || !stats || stats.anzahl === 0}
            className="py-3.5 rounded-xl border border-[#2a2a2a] bg-[#181818] text-sm font-medium text-[#888] hover:text-[#f0ede8] hover:border-[#444] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round"/>
            </svg>
            {protokollLoad ? 'Erstelle Protokoll...' : 'Übergabeprotokoll öffnen'}
          </button>

          <button type="button" onClick={exportieren}
            disabled={exportLoading || !stats || stats.anzahl === 0}
            className="py-3.5 rounded-xl bg-[#d4e840] text-black font-medium hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2 text-sm">
            {exportLoading ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Wird erstellt...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" strokeLinecap="round"/></svg>
              DATEV CSV herunterladen{stats ? ` (${stats.anzahl})` : ''}</>
            )}
          </button>
        </div>

        <p className="text-xs text-[#333] text-center pb-4">
          Entwürfe werden nicht exportiert · Dateiname: DATEV_[Mandant]_[JJJJMM].csv
        </p>
      </div>
    </div>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface GoogleStatus {
  verbunden: boolean
  erstellt_am: string | null
  kalender_name: string | null
}

interface Termin {
  id: string; typ: string; nummer: string; kunde_name: string
  ausfuehrungszeitraum: string | null; gueltig_bis: string | null
  brutto: number; status: string; created_at: string
}

export default function KalenderPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [termine, setTermine]           = useState<Termin[]>([])
  const [loading, setLoading]           = useState(true)
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null)
  const [syncLoading, setSyncLoading]   = useState(false)
  const [icsLoading, setIcsLoading]     = useState(false)
  const [banner, setBanner]             = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    loadData()
    if (searchParams.get('google') === 'verbunden') {
      setBanner({ msg: '✓ Google Calendar erfolgreich verbunden!', ok: true })
      setTimeout(() => setBanner(null), 5000)
    }
    if (searchParams.get('error')) {
      setBanner({ msg: 'Verbindung fehlgeschlagen. Bitte erneut versuchen.', ok: false })
      setTimeout(() => setBanner(null), 5000)
    }
  }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const [termineRes, googleRes] = await Promise.all([
      (supabase as any)
        .from('dokumente')
        .select('id,typ,nummer,kunde_name,ausfuehrungszeitraum,gueltig_bis,brutto,status,created_at')
        .eq('user_id', user.id)
        .or('ausfuehrungszeitraum.not.is.null,gueltig_bis.not.is.null')
        .in('status', ['entwurf','offen','angenommen'])
        .order('created_at', { ascending: false })
        .limit(20),

      // Google Status laden
      fetch('/api/kalender/google?action=status', {
        headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
      }).then(r => r.json()).catch(() => ({ verbunden: false }))
    ])

    setTermine(termineRes.data || [])
    setGoogleStatus(googleRes)
    setLoading(false)
  }

  const googleVerbinden = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/kalender/google?action=auth', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const { url, error } = await res.json()
    if (error) { alert(error); return }
    if (url) window.location.href = url
  }

  const googleTrennen = async () => {
    if (!confirm('Google Calendar Verbindung trennen?')) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/kalender/google?action=disconnect', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    setGoogleStatus({ verbunden: false, erstellt_am: null, kalender_name: null })
    setBanner({ msg: 'Google Calendar getrennt.', ok: false })
    setTimeout(() => setBanner(null), 3000)
  }

  const googleSync = async () => {
    setSyncLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/kalender/google?action=sync', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const result = await res.json()
    setSyncLoading(false)
    if (result.success) {
      setBanner({ msg: `✓ ${result.erstellt} Termine zu Google Calendar hinzugefügt.`, ok: true })
    } else {
      setBanner({ msg: result.error || 'Sync fehlgeschlagen', ok: false })
    }
    setTimeout(() => setBanner(null), 5000)
  }

  const icsDownloaden = async () => {
    setIcsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/kalender', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      })
      if (!res.ok) { alert('Export fehlgeschlagen'); return }
      const blob     = await res.blob()
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'werkwort.ics'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = filename; a.click()
      URL.revokeObjectURL(a.href)
    } finally { setIcsLoading(false) }
  }

  const TYP_ICON: Record<string, string> = {
    angebot: '📋', rechnung: '🧾', bauvertrag: '📄', bautagebuch: '📓'
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-[#555] hover:text-[#888] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <h1 className="text-lg font-medium">Kalender & Termine</h1>
      </div>

      {banner && (
        <div className={`px-6 py-3 text-sm text-center border-b ${banner.ok ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
          {banner.msg}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ─── Google Calendar ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <h2 className="text-base font-medium">Google Calendar</h2>
                {googleStatus?.verbunden && (
                  <span className="text-xs bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full">Verbunden</span>
                )}
              </div>
              <p className="text-sm text-[#555]">
                {googleStatus?.verbunden
                  ? `Verbunden mit: ${googleStatus.kalender_name || 'Primärer Kalender'}`
                  : 'Ausführungstermine und Fälligkeiten direkt in Google Calendar synchronisieren.'}
              </p>
            </div>
          </div>

          {process.env.NEXT_PUBLIC_GOOGLE_CONFIGURED !== '1' ? (
            // Google noch nicht konfiguriert — Anleitung zeigen
            <div className="bg-[#111] border border-[#2a2a2a] rounded-xl p-5 space-y-3">
              <p className="text-sm font-medium text-[#d4e840]">Einrichtung erforderlich</p>
              <p className="text-xs text-[#555] leading-relaxed">
                Um Google Calendar zu verbinden, benötigst du Google OAuth-Zugangsdaten.
              </p>
              <ol className="text-xs text-[#555] space-y-1.5 list-none">
                {[
                  'Gehe zu console.cloud.google.com → Neues Projekt erstellen',
                  'APIs & Dienste → Google Calendar API aktivieren',
                  'Anmeldedaten → OAuth 2.0-Client-ID erstellen (Web-Anwendung)',
                  `Autorisierte Weiterleitungs-URI: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/kalender/callback`,
                  'Client-ID und Secret in .env.local eintragen:',
                ].map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#d4e840] flex-shrink-0">{i+1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <div className="bg-[#0c0c0c] rounded-lg p-3 font-mono text-xs text-[#d4e840]">
                GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com<br/>
                GOOGLE_CLIENT_SECRET=xxx
              </div>
            </div>
          ) : googleStatus?.verbunden ? (
            <div className="flex gap-3">
              <button type="button" onClick={googleSync} disabled={syncLoading}
                className="flex-1 py-2.5 bg-[#d4e840] text-black text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                {syncLoading
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Synchronisiere...</>
                  : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/></svg>
                    Jetzt synchronisieren
                  </>}
              </button>
              <button type="button" onClick={googleTrennen}
                className="px-4 py-2.5 border border-red-500/20 text-red-500/60 text-sm rounded-xl hover:text-red-400 hover:border-red-500/40 transition-all">
                Trennen
              </button>
            </div>
          ) : (
            <button type="button" onClick={googleVerbinden}
              className="w-full py-3 bg-[#d4e840] text-black text-sm font-medium rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Mit Google Calendar verbinden
            </button>
          )}
        </div>

        {/* ─── ICS Export ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <svg className="w-5 h-5 text-[#555]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                <h2 className="text-base font-medium">ICS / iCal Export</h2>
                <span className="text-xs bg-[#2a2a2a] text-[#888] px-2.5 py-1 rounded-full">Kein Account nötig</span>
              </div>
              <p className="text-sm text-[#555]">
                Alle Termine als .ics-Datei herunterladen — importierbar in Apple Calendar, Outlook, Thunderbird und jeden anderen Kalender.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5 text-xs text-[#555]">
            {[
              { icon: '📋', label: 'Ausführungstermine', desc: 'Aus Angeboten + Aufträgen' },
              { icon: '💰', label: 'Zahlungsfristen',    desc: 'Fällige Rechnungen mit Alarm' },
              { icon: '🏗️', label: 'Projekte',          desc: 'Aktive Projekte als Zeitraum' },
            ].map(item => (
              <div key={item.label} className="bg-[#111] rounded-xl p-3 flex items-center gap-3">
                <span className="text-lg">{item.icon}</span>
                <div>
                  <p className="font-medium text-[#888]">{item.label}</p>
                  <p className="text-[#444]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={icsDownloaden} disabled={icsLoading}
            className="w-full py-3 bg-[#2a2a2a] text-[#f0ede8] text-sm font-medium rounded-xl hover:bg-[#333] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
            {icsLoading
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Erstelle ICS...</>
              : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" strokeLinecap="round"/></svg>.ics Datei herunterladen</>}
          </button>
        </div>

        {/* ─── Kommende Termine ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2a2a2a]">
            <p className="text-xs text-[#444] uppercase tracking-widest">Termine in Werkwort</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="w-5 h-5 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>
          ) : termine.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#444] text-sm mb-2">Keine Termine vorhanden</p>
              <p className="text-xs text-[#333]">Termine entstehen automatisch wenn du bei Angeboten einen Ausführungszeitraum angibst</p>
            </div>
          ) : (
            <div>
              {termine.map((t, i) => (
                <Link key={t.id} href={`/dokumente/${t.id}`}
                  className={`flex items-center gap-4 px-6 py-4 hover:bg-[#1f1f1f] transition-colors ${i !== termine.length-1 ? 'border-b border-[#1f1f1f]' : ''}`}>
                  <span className="text-xl flex-shrink-0">{TYP_ICON[t.typ] || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.kunde_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {t.ausfuehrungszeitraum && (
                        <span className="text-xs text-[#d4e840]">📅 {t.ausfuehrungszeitraum}</span>
                      )}
                      {t.gueltig_bis && t.typ === 'rechnung' && (
                        <span className="text-xs text-[#888]">
                          Fällig: {new Date(t.gueltig_bis).toLocaleDateString('de-DE')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm tabular-nums">{Number(t.brutto).toLocaleString('de-DE',{minimumFractionDigits:2})} €</p>
                    <p className="text-xs text-[#555] mt-0.5">{t.nummer}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
      <div className="h-8"/>
    </div>
  )
}
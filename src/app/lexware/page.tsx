'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface LexwareStatus {
  verbunden: boolean; organisation?: string
  letzter_sync?: string; sync_stats?: { erfolg: number; fehler: number; gesamt: number }
  verbunden_am?: string
}
interface SyncLog {
  id: string; dokument_id: string; lexware_id: string | null
  typ: string; status: string; fehler: string | null; erstellt_am: string
}

export default function LexwarePage() {
  const router = useRouter()
  const [status, setStatus]         = useState<LexwareStatus | null>(null)
  const [log, setLog]               = useState<SyncLog[]>([])
  const [loading, setLoading]       = useState(true)
  const [apiKey, setApiKey]         = useState('')
  const [testLoading, setTestLoad]  = useState(false)
  const [saveLoading, setSaveLoad]  = useState(false)
  const [syncLoading, setSyncLoad]  = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [banner, setBanner]         = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { loadData() }, [])

  const getHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/auth'); throw new Error('Nicht angemeldet') }
    return { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const h = await getHeaders()
      const [statusRes, logRes] = await Promise.all([
        fetch('/api/lexware?action=status', { headers: h }),
        fetch('/api/lexware?action=log', { headers: h }),
      ])
      setStatus(await statusRes.json())
      const logData = await logRes.json()
      setLog(logData.log || [])
    } catch {}
    setLoading(false)
  }

  const apiKeyTesten = async () => {
    if (!apiKey.trim()) return
    setTestLoad(true); setTestResult(null)
    try {
      const h = await getHeaders()
      const res = await fetch(`/api/lexware?action=test&key=${encodeURIComponent(apiKey)}`, { headers: h })
      const data = await res.json()
      setTestResult(data.ok
        ? { ok: true,  msg: `✓ Verbindung erfolgreich — Organisation: ${data.organisation}` }
        : { ok: false, msg: `✗ ${data.error}` }
      )
    } finally { setTestLoad(false) }
  }

  const verbinden = async () => {
    if (!apiKey.trim()) return
    setSaveLoad(true)
    try {
      const h = await getHeaders()
      const res = await fetch('/api/lexware', {
        method: 'POST', headers: h,
        body: JSON.stringify({ action: 'connect', apiKey }),
      })
      const data = await res.json()
      if (data.success) {
        setBanner({ msg: `✓ Lexware verbunden — ${data.organisation}`, ok: true })
        setApiKey(''); loadData()
      } else {
        setBanner({ msg: data.error || 'Fehler', ok: false })
      }
    } finally { setSaveLoad(false); setTimeout(() => setBanner(null), 5000) }
  }

  const trennen = async () => {
    if (!confirm('Lexware-Verbindung trennen?')) return
    const h = await getHeaders()
    await fetch('/api/lexware?action=disconnect', { headers: h })
    setStatus({ verbunden: false }); setLog([])
    setBanner({ msg: 'Lexware getrennt.', ok: false })
    setTimeout(() => setBanner(null), 3000)
  }

  const allesSyncen = async () => {
    setSyncLoad(true)
    try {
      const h = await getHeaders()
      const res = await fetch('/api/lexware', {
        method: 'POST', headers: h,
        body: JSON.stringify({ action: 'sync_alle' }),
      })
      const data = await res.json()
      if (data.success) {
        setBanner({ msg: `✓ Sync abgeschlossen — ${data.erfolg} erfolgreich, ${data.fehler} Fehler`, ok: data.fehler === 0 })
        loadData()
      } else {
        setBanner({ msg: data.error || 'Sync fehlgeschlagen', ok: false })
      }
    } finally { setSyncLoad(false); setTimeout(() => setBanner(null), 6000) }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-3">
        <Link href="/profil" className="text-[#555] hover:text-[#888] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-medium">Lexware Office</h1>
          <p className="text-xs text-[#555]">Rechnungen automatisch in Lexware übertragen</p>
        </div>
      </div>

      {banner && (
        <div className={`px-6 py-3 text-sm text-center border-b ${banner.ok ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-[#2a2a2a] text-[#888] border-[#333]'}`}>
          {banner.msg}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Info-Box */}
        <div className="bg-[#d4e840]/5 border border-[#d4e840]/20 rounded-2xl p-5 space-y-2">
          <p className="text-sm font-medium text-[#d4e840]">Wie es funktioniert</p>
          <p className="text-sm text-[#888] leading-relaxed">
            Verbinde deinen Lexware Office Account mit einem API-Key. Werkwort überträgt dann deine Rechnungen automatisch nach Lexware — inkl. Kundenkontakt, Positionen, MwSt und Zahlungsbedingungen. Der Steuerberater sieht alles direkt in Lexware.
          </p>
          <p className="text-xs text-[#555]">
            Benötigt: Lexware Office XL-Plan · Rechnungen werden in Lexware direkt finalisiert (Status: Offen)
          </p>
        </div>

        {/* Status + Aktionen */}
        {loading ? (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
            <div className="h-20 bg-[#111] rounded-xl animate-pulse"/>
          </div>
        ) : status?.verbunden ? (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#e8f4ff] rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-[#185FA5] font-bold text-sm">LW</span>
                </div>
                <div>
                  <p className="font-medium">Lexware Office</p>
                  <p className="text-xs text-[#555]">{status.organisation}</p>
                </div>
              </div>
              <span className="text-xs bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full">Verbunden</span>
            </div>

            {/* Sync-Stats */}
            {status.sync_stats && (
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-[#111] rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold text-green-400 tabular-nums">{status.sync_stats.erfolg}</p>
                  <p className="text-xs text-[#555] mt-0.5">Übertragen</p>
                </div>
                <div className="bg-[#111] rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold tabular-nums">{status.sync_stats.gesamt}</p>
                  <p className="text-xs text-[#555] mt-0.5">Gesamt</p>
                </div>
                <div className="bg-[#111] rounded-xl p-3 text-center">
                  <p className="text-xl font-semibold text-red-400 tabular-nums">{status.sync_stats.fehler}</p>
                  <p className="text-xs text-[#555] mt-0.5">Fehler</p>
                </div>
              </div>
            )}

            {status.letzter_sync && (
              <p className="text-xs text-[#444] mb-4">
                Letzter Sync: {new Date(status.letzter_sync).toLocaleString('de-DE')}
              </p>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={allesSyncen} disabled={syncLoading}
                className="flex-1 py-3 bg-[#d4e840] text-black font-medium text-sm rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                {syncLoading
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Synchronisiere...</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/></svg>Alle Rechnungen synchronisieren</>}
              </button>
              <button type="button" onClick={trennen}
                className="px-4 py-3 border border-red-500/20 text-red-500/60 text-sm rounded-xl hover:text-red-400 hover:border-red-500/40 transition-all">
                Trennen
              </button>
            </div>
          </div>
        ) : (
          /* API-Key eingeben */
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
            <p className="text-xs text-[#444] uppercase tracking-widest mb-5">Lexware API-Key einrichten</p>

            {/* Anleitung */}
            <div className="bg-[#111] rounded-xl p-4 mb-5 space-y-2 text-xs text-[#555]">
              <p className="text-[#888] font-medium">API-Key generieren:</p>
              <ol className="space-y-1.5">
                {[
                  'Lexware Office öffnen → Einstellungen',
                  'Integrationen → Public API',
                  '"Neuen API-Key erstellen" klicken',
                  'Nutzungsbedingungen akzeptieren → Key kopieren',
                  'Key unten einfügen und speichern',
                ].map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#d4e840] flex-shrink-0">{i+1}.</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <a href="https://app.lexoffice.de/settings/#/public-api" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#d4e840] hover:opacity-75 transition-opacity mt-1">
                Lexware Einstellungen öffnen →
              </a>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#666] mb-1.5 block">API-Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setTestResult(null) }}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#333] font-mono focus:outline-none focus:border-[#d4e840] transition-colors"/>
              </div>

              {testResult && (
                <p className={`text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {testResult.msg}
                </p>
              )}

              <div className="flex gap-3">
                <button type="button" onClick={apiKeyTesten} disabled={testLoading || !apiKey.trim()}
                  className="px-4 py-2.5 border border-[#2a2a2a] text-sm text-[#888] rounded-xl hover:text-[#f0ede8] hover:border-[#444] disabled:opacity-40 transition-all">
                  {testLoading ? 'Teste...' : 'Verbindung testen'}
                </button>
                <button type="button" onClick={verbinden} disabled={saveLoading || !apiKey.trim()}
                  className="flex-1 py-2.5 bg-[#d4e840] text-black font-medium text-sm rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                  {saveLoading ? 'Speichern...' : 'Verbinden & speichern'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sync-Log */}
        {log.length > 0 && (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#2a2a2a]">
              <p className="text-xs text-[#444] uppercase tracking-widest">Sync-Protokoll</p>
            </div>
            <div>
              {log.map((eintrag, i) => (
                <div key={eintrag.id}
                  className={`flex items-center gap-4 px-6 py-3.5 ${i !== log.length-1 ? 'border-b border-[#1f1f1f]' : ''}`}>
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${eintrag.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{eintrag.typ === 'invoice' ? 'Rechnung' : eintrag.typ}</p>
                    {eintrag.lexware_id && <p className="text-xs text-[#444] font-mono">Lexware-ID: {eintrag.lexware_id.slice(0,8)}...</p>}
                    {eintrag.fehler && <p className="text-xs text-red-400 mt-0.5">{eintrag.fehler}</p>}
                  </div>
                  <p className="text-xs text-[#555] flex-shrink-0">
                    {new Date(eintrag.erstellt_am).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-[#333] text-center pb-4">
          API-Key wird verschlüsselt gespeichert · Nur Rechnungen werden übertragen · Benötigt Lexware XL-Plan
        </p>
      </div>
      <div className="h-8"/>
    </div>
  )
}
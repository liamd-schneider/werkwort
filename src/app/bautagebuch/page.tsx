'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Eintrag {
  id: string; baustelle: string; datum: string; arbeiter: number
  ausgefuehrte_arbeiten: string; lieferungen: string | null
  besuche: string | null; besonderheiten: string | null
  wetter: string | null; fotos: string[] | null; projekt_id: string | null
  // GoBD
  finalisiert: boolean; finalisiert_am: string | null
  hash_sha256: string | null; version: number
  erfasst_am: string | null
}
interface Projekt { id: string; name: string; kunde_name: string }
interface Version { id: string; version: number; grund: string; hash_sha256: string; erstellt_am: string; snapshot: Record<string, any> }

export default function BautagebuchPage() {
  const router = useRouter()
  const [eintraege, setEintraege]       = useState<Eintrag[]>([])
  const [projekte, setProjekte]         = useState<Projekt[]>([])
  const [loading, setLoading]           = useState(true)
  const [wetter, setWetter]             = useState('')
  const [wetterLoading, setWetterLoading] = useState(false)
  const [activeProjekt, setActiveProjekt] = useState('alle')
  const [erstellen, setErstellen]       = useState(false)
  const [saving, setSaving]             = useState(false)
  const [aufnahme, setAufnahme]         = useState(false)
  const [fotos, setFotos]               = useState<File[]>([])
  const [fotoUrls, setFotoUrls]         = useState<string[]>([])
  const [form, setForm]                 = useState({ eingabe: '', baustelle: '', projekt_id: '' })
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  // GoBD
  const [finalisierend, setFinalisierend] = useState<string | null>(null)
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null)
  const [bearbeitenForm, setBearbeitenForm] = useState({ ausgefuehrte_arbeiten: '', lieferungen: '', besuche: '', besonderheiten: '', wetter: '', grund: '' })
  const [bearbeitenSaving, setBearbeitenSaving] = useState(false)
  const [versionen, setVersionen]       = useState<Record<string, Version[]>>({})
  const [zeigeVersionen, setZeigeVersionen] = useState<string | null>(null)
  const [verionenLoading, setVersionenLoading] = useState<string | null>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks   = useRef<Blob[]>([])
  const fotoInput     = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData(); ladeWetter() }, [])

  const getSession = async () => (await supabase.auth.getSession()).data.session

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }
    const [tagRes, projRes] = await Promise.all([
      (supabase as any).from('bautagebuch').select('*').eq('user_id', user.id).order('datum', { ascending: false }),
      (supabase as any).from('projekte').select('id,name,kunde_name').eq('user_id', user.id).order('name'),
    ])
    setEintraege(tagRes.data || [])
    setProjekte(projRes.data || [])
    setLoading(false)
  }

  const ladeWetter = async () => {
    setWetterLoading(true)
    try {
      await new Promise<void>(resolve =>
        navigator.geolocation.getCurrentPosition(async pos => {
          const res  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,weather_code`)
          const data = await res.json()
          const temp = Math.round(data.current.temperature_2m)
          const code = data.current.weather_code
          const desc = code <= 3 ? 'Sonnig' : code <= 48 ? 'Bewölkt' : code <= 67 ? 'Regen' : 'Schnee'
          setWetter(`${desc}, ${temp}°C`)
          resolve()
        }, () => resolve())
      )
    } catch {}
    setWetterLoading(false)
  }

  const startAufnahme = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current  = new MediaRecorder(stream)
      audioChunks.current    = []
      mediaRecorder.current.ondataavailable = e => audioChunks.current.push(e.data)
      mediaRecorder.current.onstop = async () => {
        const session = await getSession()
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        const fd   = new FormData(); fd.append('file', blob, 'audio.webm')
        const res  = await fetch('/api/transcribe', { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` }, body: fd })
        const { text } = await res.json()
        if (text) setForm(f => ({ ...f, eingabe: f.eingabe ? f.eingabe + ' ' + text : text }))
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.current.start()
      setAufnahme(true)
    } catch { alert('Mikrofon-Zugriff verweigert') }
  }

  const stopAufnahme = () => { mediaRecorder.current?.stop(); setAufnahme(false) }

  const fotoHinzufuegen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setFotos(prev => [...prev, ...files])
    setFotoUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  const fotoEntfernen = (i: number) => {
    setFotos(prev => prev.filter((_, idx) => idx !== i))
    setFotoUrls(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleSpeichern = async () => {
    if (!form.eingabe.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const uploads: string[] = []
    for (const foto of fotos) {
      const ext  = foto.name.split('.').pop() || 'jpg'
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('bautagebuch-fotos').upload(path, foto)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('bautagebuch-fotos').getPublicUrl(path)
        uploads.push(publicUrl)
      }
    }

    const session = await getSession()
    const res = await fetch('/api/bautagebuch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ eingabe: form.eingabe, baustelle: form.baustelle || 'Baustelle', wetter: wetter || null, projekt_id: form.projekt_id || null, fotos: uploads }),
    })
    if (res.ok) {
      setForm({ eingabe: '', baustelle: '', projekt_id: '' })
      setFotos([]); setFotoUrls([])
      setErstellen(false)
      loadData()
    }
    setSaving(false)
  }

  const eintragLoeschen = async (eintrag: Eintrag) => {
    if (eintrag.finalisiert) { alert('GoBD: Finalisierte Einträge können nicht gelöscht werden.'); return }
    if (!confirm(`Eintrag vom ${new Date(eintrag.datum).toLocaleDateString('de-DE')} wirklich löschen?`)) return
    setDeletingId(eintrag.id)
    if (eintrag.fotos && eintrag.fotos.length > 0) {
      const paths = eintrag.fotos.map(url => url.split('/bautagebuch-fotos/')[1]?.split('?')[0]).filter(Boolean)
      if (paths.length > 0) await supabase.storage.from('bautagebuch-fotos').remove(paths)
    }
    await (supabase as any).from('bautagebuch').delete().eq('id', eintrag.id)
    setEintraege(prev => prev.filter(e => e.id !== eintrag.id))
    setDeletingId(null)
  }

  // FIX: Projekt-Zuweisung auch für finalisierte Einträge erlaubt (keine GoBD-relevante Änderung)
  const eintragProjektZuweisen = async (eintragId: string, projektId: string) => {
    await (supabase as any).from('bautagebuch').update({ projekt_id: projektId || null }).eq('id', eintragId)
    setEintraege(prev => prev.map(e => e.id === eintragId ? { ...e, projekt_id: projektId || null } : e))
  }

  // ─── GoBD: Manuell versiegeln ─────────────────────────────────
  const versiegeln = async (eintragId: string) => {
    if (!confirm('Eintrag jetzt versiegeln? Danach nur noch mit Versionshistorie bearbeitbar.')) return
    setFinalisierend(eintragId)
    const session = await getSession()
    const res = await fetch('/api/bautagebuch/finalisieren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ eintragsId: eintragId }),
    })
    const result = await res.json()
    if (result.success) {
      setEintraege(prev => prev.map(e =>
        e.id === eintragId ? { ...e, finalisiert: true, finalisiert_am: result.finalisiert_am, hash_sha256: result.hash, version: result.version } : e
      ))
    }
    setFinalisierend(null)
  }

  // ─── GoBD: Bearbeiten (neue Version) ─────────────────────────
  const bearbeitenStarten = (eintrag: Eintrag) => {
    setBearbeitenId(eintrag.id)
    setBearbeitenForm({
      ausgefuehrte_arbeiten: eintrag.ausgefuehrte_arbeiten,
      lieferungen:  eintrag.lieferungen || '',
      besuche:      eintrag.besuche || '',
      besonderheiten: eintrag.besonderheiten || '',
      wetter:       eintrag.wetter || '',
      grund:        '',
    })
  }

  const bearbeitenSpeichern = async () => {
    // FIX: Änderungsgrund nur bei finalisierten Einträgen erforderlich
    const eintrag = eintraege.find(e => e.id === bearbeitenId)
    if (!bearbeitenId || (eintrag?.finalisiert && !bearbeitenForm.grund.trim())) {
      alert('Bitte Änderungsgrund angeben (GoBD-Anforderung).')
      return
    }
    setBearbeitenSaving(true)
    const session = await getSession()
    const res = await fetch('/api/bautagebuch/finalisieren', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ eintragsId: bearbeitenId, ...bearbeitenForm }),
    })
    const result = await res.json()
    if (result.success) {
      setEintraege(prev => prev.map(e =>
        e.id === bearbeitenId ? {
          ...e,
          ausgefuehrte_arbeiten: bearbeitenForm.ausgefuehrte_arbeiten,
          lieferungen:  bearbeitenForm.lieferungen || null,
          besuche:      bearbeitenForm.besuche || null,
          besonderheiten: bearbeitenForm.besonderheiten || null,
          wetter:       bearbeitenForm.wetter || null,
          version:      result.version,
        } : e
      ))
      setBearbeitenId(null)
    } else {
      alert(result.error || 'Fehler beim Speichern')
    }
    setBearbeitenSaving(false)
  }

  // ─── GoBD: Versionen laden ────────────────────────────────────
  const ladeVersionen = async (eintragId: string) => {
    if (zeigeVersionen === eintragId) { setZeigeVersionen(null); return }
    setVersionenLoading(eintragId)
    const session = await getSession()
    const res = await fetch(`/api/bautagebuch/finalisieren?id=${eintragId}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const { versionen: v } = await res.json()
    setVersionen(prev => ({ ...prev, [eintragId]: v }))
    setZeigeVersionen(eintragId)
    setVersionenLoading(null)
  }

  // ─── Auto-Siegel Countdown anzeigen ─────────────────────────
  const getRestzeit = (erfasst_am: string | null) => {
    if (!erfasst_am) return null
    const ablauf = new Date(erfasst_am).getTime() + 30 * 60 * 1000
    const rest   = ablauf - Date.now()
    if (rest <= 0) return null
    const min = Math.floor(rest / 60000)
    const sek = Math.floor((rest % 60000) / 1000)
    return `${min}:${String(sek).padStart(2,'0')}`
  }

  // Countdown-Ticker
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick(x => x+1), 10000); return () => clearInterval(t) }, [])

  const gefiltert = activeProjekt === 'alle'
    ? eintraege
    : activeProjekt === 'kein-projekt'
      ? eintraege.filter(e => !e.projekt_id)
      : eintraege.filter(e => e.projekt_id === activeProjekt)

  const getProjektName = (id: string | null) => projekte.find(p => p.id === id)?.name || null

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Bautagebuch</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <input type="text" value={wetter} onChange={e => setWetter(e.target.value)}
              placeholder={wetterLoading ? 'Lädt...' : 'Wetter'}
              className="bg-transparent border-b border-[#2a2a2a] focus:border-[#d4e840] outline-none text-sm text-[#555] w-28 focus:text-[#f0ede8] transition-colors py-0.5"/>
            <button type="button" onClick={ladeWetter} title="Neu laden"
              className="text-[#333] hover:text-[#555] transition-colors">
              <svg className={`w-3.5 h-3.5 ${wetterLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <button type="button" onClick={() => setErstellen(!erstellen)}
            className="bg-[#d4e840] text-black text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
            Eintrag
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Neuer Eintrag */}
          {erstellen && (
            <div className="lg:col-span-1">
              <div className="bg-[#181818] border border-[#d4e840]/30 rounded-2xl p-5 sticky top-6 space-y-3">
                <p className="text-xs text-[#444] uppercase tracking-widest">Neuer Eintrag</p>
                <div>
                  <label className="text-xs text-[#666] mb-1.5 block">Baustelle (optional)</label>
                  <input type="text" value={form.baustelle} onChange={e => setForm(f => ({...f, baustelle: e.target.value}))}
                    placeholder="Name oder Adresse"
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                </div>
                {projekte.length > 0 && (
                  <div>
                    <label className="text-xs text-[#666] mb-1.5 block">Projekt</label>
                    <select value={form.projekt_id} onChange={e => setForm(f => ({...f, projekt_id: e.target.value}))}
                      className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] focus:outline-none focus:border-[#d4e840]">
                      <option value="">Kein Projekt</option>
                      {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-3 py-1">
                  <button type="button" onClick={aufnahme ? stopAufnahme : startAufnahme}
                    className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${aufnahme ? 'bg-red-500 animate-pulse' : 'bg-[#d4e840] hover:scale-105'}`}>
                    {aufnahme
                      ? <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                      : <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" strokeLinecap="round"/></svg>}
                  </button>
                  <span className="text-xs text-[#555]">{aufnahme ? 'Läuft — nochmal klicken zum Stoppen' : 'Sprechen oder tippen'}</span>
                </div>
                <textarea value={form.eingabe} onChange={e => setForm(f => ({...f, eingabe: e.target.value}))}
                  placeholder="Was wurde gemacht? Wieviele Arbeiter? Lieferungen? Besuche? Besonderheiten?"
                  rows={4}
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl p-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] resize-none transition-colors"/>
                <div>
                  <input ref={fotoInput} type="file" accept="image/*" multiple onChange={fotoHinzufuegen} className="hidden"/>
                  <button type="button" onClick={() => fotoInput.current?.click()}
                    className="w-full py-2.5 border border-dashed border-[#2a2a2a] rounded-xl text-xs text-[#555] hover:border-[#d4e840] hover:text-[#d4e840] transition-all flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round"/></svg>
                    Fotos hinzufügen
                  </button>
                  {fotoUrls.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                      {fotoUrls.map((url, i) => (
                        <div key={i} className="relative group">
                          <img src={url} alt="" className="w-full h-20 object-cover rounded-lg"/>
                          <button type="button" onClick={() => fotoEntfernen(i)}
                            className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* GoBD-Hinweis */}
                <div className="bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#444] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                  </svg>
                  <p className="text-xs text-[#444]">Wird nach 30 Min automatisch GoBD-versiegelt</p>
                </div>

                <button type="button" onClick={handleSpeichern} disabled={saving || !form.eingabe.trim()}
                  className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
                  {saving
                    ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Speichern...</>
                    : 'Eintrag speichern · 1 Token'}
                </button>
              </div>
            </div>
          )}

          {/* Einträge */}
          <div className={erstellen ? 'lg:col-span-2' : 'lg:col-span-3'}>
            {/* Filter */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {[
                { id: 'alle', label: `Alle (${eintraege.length})` },
                ...(eintraege.some(e => !e.projekt_id) ? [{ id: 'kein-projekt', label: `Ohne Projekt (${eintraege.filter(e=>!e.projekt_id).length})` }] : []),
                ...projekte.filter(p => eintraege.some(e => e.projekt_id === p.id))
                  .map(p => ({ id: p.id, label: `${p.name} (${eintraege.filter(e=>e.projekt_id===p.id).length})` }))
              ].map(tab => (
                <button key={tab.id} type="button" onClick={() => setActiveProjekt(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all flex-shrink-0 ${
                    activeProjekt === tab.id ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#181818] border border-[#2a2a2a] text-[#888] hover:text-[#f0ede8]'
                  }`}>{tab.label}</button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>
            ) : gefiltert.length === 0 ? (
              <div className="border border-dashed border-[#2a2a2a] rounded-2xl p-16 text-center">
                <p className="text-[#444] mb-3">Noch keine Einträge</p>
                <button type="button" onClick={() => setErstellen(true)} className="text-[#d4e840] text-sm hover:opacity-75">Ersten Eintrag erstellen →</button>
              </div>
            ) : (
              <div className="space-y-4">
                {gefiltert.map(eintrag => {
                  const projektName = getProjektName(eintrag.projekt_id)
                  const restzeit    = !eintrag.finalisiert ? getRestzeit(eintrag.erfasst_am || eintrag.datum) : null
                  const istBearbeiten = bearbeitenId === eintrag.id

                  return (
                    <div key={eintrag.id} className={`bg-[#181818] border rounded-2xl p-5 ${eintrag.finalisiert ? 'border-green-500/25' : 'border-[#2a2a2a]'}`}>

                      {/* Header */}
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <p className="font-medium">{eintrag.baustelle}</p>
                            {/* GoBD-Badge */}
                            {eintrag.finalisiert ? (
                              <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20 flex items-center gap-1 flex-shrink-0">
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                                </svg>
                                GoBD · V{eintrag.version}
                              </span>
                            ) : restzeit ? (
                              <span className="text-xs text-yellow-500/70 flex items-center gap-1 flex-shrink-0">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/>
                                </svg>
                                Siegel in {restzeit}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-[#555]">
                            {new Date(eintrag.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>

                        {/* Aktions-Buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          {eintrag.wetter && <span className="text-xs text-[#555]">{eintrag.wetter}</span>}
                          <span className="text-xs text-[#555] flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                            {eintrag.arbeiter}
                          </span>
                          {/* FIX: Projekt-Zuweisung immer anzeigen, auch bei finalisierten Einträgen */}
                          {projekte.length > 0 && (
                            <select value={eintrag.projekt_id || ''} onChange={e => eintragProjektZuweisen(eintrag.id, e.target.value)}
                              className="text-xs bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[#555] focus:outline-none focus:border-[#d4e840] max-w-[130px]">
                              <option value="">Kein Projekt</option>
                              {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                          {/* Versionen-Button */}
                          {eintrag.finalisiert && (
                            <button type="button" onClick={() => ladeVersionen(eintrag.id)}
                              className="text-xs px-2.5 py-1 bg-[#111] border border-[#2a2a2a] rounded-lg text-[#555] hover:text-[#888] transition-all flex items-center gap-1">
                              {verionenLoading === eintrag.id
                                ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/></svg>}
                              Versionen
                            </button>
                          )}
                          {/* Bearbeiten (auch bei finalisierten — neue Version) */}
                          {!istBearbeiten && (
                            <button type="button" onClick={() => bearbeitenStarten(eintrag)}
                              className="text-xs px-2.5 py-1 bg-[#111] border border-[#2a2a2a] rounded-lg text-[#555] hover:text-[#f0ede8] hover:border-[#444] transition-all flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round"/>
                              </svg>
                              {eintrag.finalisiert ? 'Korrektur' : 'Bearbeiten'}
                            </button>
                          )}
                          {/* Manuell versiegeln */}
                          {!eintrag.finalisiert && (
                            <button type="button" onClick={() => versiegeln(eintrag.id)} disabled={finalisierend === eintrag.id}
                              className="text-xs px-2.5 py-1 bg-[#111] border border-[#2a2a2a] rounded-lg text-[#555] hover:text-green-400 hover:border-green-500/30 transition-all flex items-center gap-1 disabled:opacity-40">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                              </svg>
                              Siegeln
                            </button>
                          )}
                          {/* Löschen */}
                          <button type="button" onClick={() => eintragLoeschen(eintrag)} disabled={deletingId === eintrag.id || eintrag.finalisiert}
                            className={`transition-colors disabled:opacity-30 ${eintrag.finalisiert ? 'text-[#222] cursor-not-allowed' : 'text-[#333] hover:text-red-400'}`}
                            title={eintrag.finalisiert ? 'GoBD: nicht löschbar' : 'Löschen'}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>

                      {projektName && (
                        <div className="mb-3">
                          <span className="text-xs bg-[#d4e840]/10 text-[#d4e840] px-2 py-0.5 rounded-full border border-[#d4e840]/20">{projektName}</span>
                        </div>
                      )}

                      {/* Bearbeiten-Formular */}
                      {istBearbeiten ? (
                        <div className="space-y-3 mt-2">
                          {eintrag.finalisiert && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-2 text-xs text-yellow-400">
                              Finalisierter Eintrag — Änderung wird als neue Version gespeichert (GoBD-konform)
                            </div>
                          )}
                          <textarea value={bearbeitenForm.ausgefuehrte_arbeiten}
                            onChange={e => setBearbeitenForm(f => ({...f, ausgefuehrte_arbeiten: e.target.value}))}
                            rows={3}
                            className="w-full bg-[#111] border border-[#d4e840]/40 rounded-xl p-3 text-sm text-[#f0ede8] focus:outline-none focus:border-[#d4e840] resize-none transition-colors"/>
                          <div className="grid grid-cols-2 gap-2">
                            {[['lieferungen','Lieferungen'],['besuche','Besuche'],['besonderheiten','Besonderheiten'],['wetter','Wetter']].map(([key,label]) => (
                              <input key={key} type="text"
                                value={(bearbeitenForm as any)[key]}
                                onChange={e => setBearbeitenForm(f => ({...f, [key]: e.target.value}))}
                                placeholder={label}
                                className="bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                            ))}
                          </div>
                          {eintrag.finalisiert && (
                            <input type="text" value={bearbeitenForm.grund}
                              onChange={e => setBearbeitenForm(f => ({...f, grund: e.target.value}))}
                              placeholder="Änderungsgrund * (z.B. Tippfehler korrigiert)"
                              className="w-full bg-[#111] border border-red-500/30 rounded-xl px-3 py-2 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                          )}
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setBearbeitenId(null)}
                              className="flex-1 py-2 rounded-xl border border-[#2a2a2a] text-sm text-[#888] hover:text-[#f0ede8] transition-all">
                              Abbrechen
                            </button>
                            <button type="button" onClick={bearbeitenSpeichern} disabled={bearbeitenSaving || (eintrag.finalisiert && !bearbeitenForm.grund.trim())}
                              className="flex-1 py-2 rounded-xl bg-[#d4e840] text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all">
                              {bearbeitenSaving ? 'Speichern...' : eintrag.finalisiert ? 'Als neue Version speichern' : 'Speichern'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-[#ccc] leading-relaxed">{eintrag.ausgefuehrte_arbeiten}</p>
                          {eintrag.lieferungen && <p className="text-xs text-[#555]"><span className="text-[#444]">Lieferung: </span>{eintrag.lieferungen}</p>}
                          {eintrag.besuche && <p className="text-xs text-[#555]"><span className="text-[#444]">Besuche: </span>{eintrag.besuche}</p>}
                          {eintrag.besonderheiten && (
                            <div className="bg-[#d4e840]/5 border border-[#d4e840]/20 rounded-xl p-3 mt-2">
                              <p className="text-xs text-[#d4e840] mb-1">Besonderheit</p>
                              <p className="text-sm text-[#ccc]">{eintrag.besonderheiten}</p>
                            </div>
                          )}
                          {eintrag.fotos && eintrag.fotos.length > 0 && (
                            <div className="grid grid-cols-4 gap-1.5 mt-3">
                              {eintrag.fotos.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                  <img src={url} alt="" className="w-full h-20 object-cover rounded-lg hover:opacity-80 transition-opacity"/>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* GoBD Siegel-Info */}
                      {eintrag.finalisiert && eintrag.hash_sha256 && !istBearbeiten && (
                        <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
                          <div className="flex items-start gap-2">
                            <svg className="w-3.5 h-3.5 text-green-500/50 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                            </svg>
                            <div className="min-w-0">
                              <p className="text-xs text-[#333]">
                                Versiegelt {new Date(eintrag.finalisiert_am!).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                              </p>
                              <p className="font-mono text-[9px] text-[#2a2a2a] truncate mt-0.5">{eintrag.hash_sha256}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Versionshistorie */}
                      {zeigeVersionen === eintrag.id && versionen[eintrag.id] && (
                        <div className="mt-3 pt-3 border-t border-[#1f1f1f]">
                          <p className="text-xs text-[#444] uppercase tracking-wider mb-2">Versionshistorie</p>
                          <div className="space-y-2">
                            {versionen[eintrag.id].length === 0 ? (
                              <p className="text-xs text-[#333]">Keine früheren Versionen</p>
                            ) : (() => {
                              const DIFF_FELDER: { key: string; label: string }[] = [
                                { key: 'ausgefuehrte_arbeiten', label: 'Arbeiten' },
                                { key: 'lieferungen',           label: 'Lieferungen' },
                                { key: 'besuche',               label: 'Besuche' },
                                { key: 'besonderheiten',        label: 'Besonderheiten' },
                                { key: 'wetter',                label: 'Wetter' },
                                { key: 'arbeiter',              label: 'Arbeiter' },
                                { key: 'baustelle',             label: 'Baustelle' },
                                { key: 'datum',                 label: 'Datum' },
                              ]

                              const alle = [...versionen[eintrag.id]]

                              return alle.map((v, idx) => {
                                const next = idx < alle.length - 1 ? alle[idx + 1].snapshot : eintrag
                                const prev = v.snapshot as Record<string, any>
                                const diffs = DIFF_FELDER.filter(f => {
                                  const vorher = prev[f.key] ?? null
                                  const nachher = (next as any)[f.key] ?? null
                                  return String(vorher) !== String(nachher)
                                })

                                return (
                                  <div key={v.id} className="bg-[#111] rounded-xl p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-[#d4e840] font-mono font-bold">V{v.version}</span>
                                        <span className="text-xs text-[#555]">{v.grund}</span>
                                      </div>
                                      <span className="text-[10px] text-[#333] flex-shrink-0">
                                        {new Date(v.erstellt_am).toLocaleString('de-DE')}
                                      </span>
                                    </div>

                                    {diffs.length > 0 ? (
                                      <div className="space-y-1.5">
                                        {diffs.map(f => {
                                          const vorher  = prev[f.key] ?? '—'
                                          const nachher = (next as any)[f.key] ?? '—'
                                          return (
                                            <div key={f.key} className="rounded-lg overflow-hidden text-xs">
                                              <p className="text-[#444] px-2 pt-1.5 pb-0.5">{f.label}</p>
                                              <div className="grid grid-cols-2 divide-x divide-[#1a1a1a]">
                                                <div className="bg-red-500/5 px-2 py-1.5">
                                                  <p className="text-[10px] text-red-500/40 mb-0.5">Vorher</p>
                                                  <p className="text-[#666] leading-relaxed break-words">{String(vorher)}</p>
                                                </div>
                                                <div className="bg-green-500/5 px-2 py-1.5">
                                                  <p className="text-[10px] text-green-500/40 mb-0.5">Nachher</p>
                                                  <p className="text-[#aaa] leading-relaxed break-words">{String(nachher)}</p>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-[#333] italic">Keine inhaltlichen Änderungen in diesem Snapshot</p>
                                    )}

                                    <p className="font-mono text-[9px] text-[#222] truncate">{v.hash_sha256}</p>
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="h-24 md:h-8"/>
    </div>
  )
}
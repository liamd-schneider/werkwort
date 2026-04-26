'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Eintrag {
  id: string; baustelle: string; datum: string; arbeiter: number
  ausgefuehrte_arbeiten: string; lieferungen: string | null
  besuche: string | null; besonderheiten: string | null
  wetter: string | null; fotos: string[] | null; projekt_id: string | null
  finalisiert: boolean; finalisiert_am: string | null
  hash_sha256: string | null; version: number
  erfasst_am: string | null
}
interface Projekt { id: string; name: string; kunde_name: string }
interface Version { id: string; version: number; grund: string; hash_sha256: string; erstellt_am: string; snapshot: Record<string, any> }

export default function BautagebuchPage() {
  const router = useRouter()
  const [eintraege, setEintraege]           = useState<Eintrag[]>([])
  const [projekte, setProjekte]             = useState<Projekt[]>([])
  const [loading, setLoading]               = useState(true)
  const [wetter, setWetter]                 = useState('')
  const [wetterLoading, setWetterLoading]   = useState(false)
  const [activeProjekt, setActiveProjekt]   = useState('alle')
  const [erstellen, setErstellen]           = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [aufnahme, setAufnahme]             = useState(false)
  const [fotos, setFotos]                   = useState<File[]>([])
  const [fotoUrls, setFotoUrls]             = useState<string[]>([])
  const [form, setForm]                     = useState({ eingabe: '', baustelle: '', projekt_id: '' })
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [finalisierend, setFinalisierend]   = useState<string | null>(null)
  const [bearbeitenId, setBearbeitenId]     = useState<string | null>(null)
  const [bearbeitenForm, setBearbeitenForm] = useState({ ausgefuehrte_arbeiten: '', lieferungen: '', besuche: '', besonderheiten: '', wetter: '', grund: '' })
  const [bearbeitenSaving, setBearbeitenSaving] = useState(false)
  const [versionen, setVersionen]           = useState<Record<string, Version[]>>({})
  const [zeigeVersionen, setZeigeVersionen] = useState<string | null>(null)
  const [verionenLoading, setVersionenLoading] = useState<string | null>(null)
  const [tick, setTick]                     = useState(0)
  // NEU: Suche + mobile Projekt-Dropdown
  const [suche, setSuche]                   = useState('')
  const [projektDropdownOffen, setProjektDropdownOffen] = useState(false)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks   = useRef<Blob[]>([])
  const fotoInput     = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData(); ladeWetter() }, [])
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 10000); return () => clearInterval(t) }, [])

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
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current   = []
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

  const eintragProjektZuweisen = async (eintragId: string, projektId: string) => {
    await (supabase as any).from('bautagebuch').update({ projekt_id: projektId || null }).eq('id', eintragId)
    setEintraege(prev => prev.map(e => e.id === eintragId ? { ...e, projekt_id: projektId || null } : e))
  }

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

  const bearbeitenStarten = (eintrag: Eintrag) => {
    setBearbeitenId(eintrag.id)
    setBearbeitenForm({
      ausgefuehrte_arbeiten: eintrag.ausgefuehrte_arbeiten,
      lieferungen:    eintrag.lieferungen || '',
      besuche:        eintrag.besuche || '',
      besonderheiten: eintrag.besonderheiten || '',
      wetter:         eintrag.wetter || '',
      grund:          '',
    })
  }

  const bearbeitenSpeichern = async () => {
    const eintrag = eintraege.find(e => e.id === bearbeitenId)
    if (!bearbeitenId || (eintrag?.finalisiert && !bearbeitenForm.grund.trim())) {
      alert('Bitte Änderungsgrund angeben (GoBD-Anforderung.')
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
          lieferungen:    bearbeitenForm.lieferungen || null,
          besuche:        bearbeitenForm.besuche || null,
          besonderheiten: bearbeitenForm.besonderheiten || null,
          wetter:         bearbeitenForm.wetter || null,
          version:        result.version,
        } : e
      ))
      setBearbeitenId(null)
    } else {
      alert(result.error || 'Fehler beim Speichern')
    }
    setBearbeitenSaving(false)
  }

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

  const getRestzeit = (erfasst_am: string | null) => {
    if (!erfasst_am) return null
    const ablauf = new Date(erfasst_am).getTime() + 30 * 60 * 1000
    const rest   = ablauf - Date.now()
    if (rest <= 0) return null
    const min = Math.floor(rest / 60000)
    const sek = Math.floor((rest % 60000) / 1000)
    return `${min}:${String(sek).padStart(2, '0')}`
  }

  // ── Suche: filtert über Baustelle, Projektname, Datum, Arbeiten, Besonderheiten ──
  const sucheNormalisiert = suche.toLowerCase().trim()
  const getProjektName = (id: string | null) => projekte.find(p => p.id === id)?.name || null

  const matchesSuche = (e: Eintrag) => {
    if (!sucheNormalisiert) return true
    const projektName = getProjektName(e.projekt_id) || ''
    const datumStr = new Date(e.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return [
      e.baustelle,
      projektName,
      datumStr,
      e.ausgefuehrte_arbeiten,
      e.besonderheiten || '',
      e.lieferungen || '',
      e.besuche || '',
      e.wetter || '',
    ].some(feld => feld.toLowerCase().includes(sucheNormalisiert))
  }

  const gefiltertNachProjekt = activeProjekt === 'alle'
    ? eintraege
    : activeProjekt === 'kein-projekt'
      ? eintraege.filter(e => !e.projekt_id)
      : eintraege.filter(e => e.projekt_id === activeProjekt)

  const gefiltert = gefiltertNachProjekt.filter(matchesSuche)

  const filterTabs = [
    { id: 'alle',         label: `Alle`,          count: eintraege.filter(matchesSuche).length },
    ...(eintraege.some(e => !e.projekt_id) ? [{ id: 'kein-projekt', label: 'Ohne Projekt', count: eintraege.filter(e => !e.projekt_id && matchesSuche(e)).length }] : []),
    ...projekte
      .filter(p => eintraege.some(e => e.projekt_id === p.id))
      .map(p => ({ id: p.id, label: p.name, count: eintraege.filter(e => e.projekt_id === p.id && matchesSuche(e)).length })),
  ]

  // Aktives Projekt-Label für den Dropdown-Button auf Mobile
  const aktiverTab = filterTabs.find(t => t.id === activeProjekt)
  const projektTabs = filterTabs.filter(t => t.id !== 'alle' && t.id !== 'kein-projekt')

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* ── Top Bar ── */}
      <div className="border-b border-[#1a1a1a] px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between mb-2 sm:mb-0">
          <h1 className="text-lg font-medium">Bautagebuch</h1>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5">
              <input type="text" value={wetter} onChange={e => setWetter(e.target.value)}
                placeholder={wetterLoading ? 'Lädt…' : 'Wetter'}
                className="bg-transparent border-b border-[#2a2a2a] focus:border-[#d4e840] outline-none text-sm text-[#777] w-24 focus:text-[#f0ede8] transition-colors py-0.5"/>
              <button type="button" onClick={ladeWetter} title="Neu laden"
                className="text-[#444] hover:text-[#777] transition-colors">
                <svg className={`w-3.5 h-3.5 ${wetterLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <button type="button" onClick={() => setErstellen(!erstellen)}
              className="bg-[#d4e840] text-black text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
              </svg>
              Eintrag
            </button>
          </div>
        </div>
        {/* Wetter Mobile */}
        <div className="flex items-center gap-1.5 sm:hidden">
          <svg className="w-3.5 h-3.5 text-[#555]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
          </svg>
          <input type="text" value={wetter} onChange={e => setWetter(e.target.value)}
            placeholder={wetterLoading ? 'Lädt…' : 'Wetter eingeben'}
            className="bg-transparent outline-none text-sm text-[#888] flex-1 focus:text-[#f0ede8] transition-colors"/>
          <button type="button" onClick={ladeWetter}
            className="text-[#444] hover:text-[#777] transition-colors">
            <svg className={`w-3.5 h-3.5 ${wetterLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ── Suchleiste ── */}
        <div className="mb-5 relative">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-[#555]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round"/>
            </svg>
          </div>
          <input
            type="text"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Suchen nach Datum, Baustelle, Projekt, Tätigkeit…"
            className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl pl-10 pr-10 py-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"
          />
          {suche && (
            <button
              type="button"
              onClick={() => setSuche('')}
              className="absolute inset-y-0 right-3 flex items-center text-[#444] hover:text-[#888] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Neuer Eintrag ── */}
          {erstellen && (
            <div className="lg:col-span-1">
              <div className="bg-[#181818] border border-[#d4e840]/30 rounded-2xl p-5 sticky top-6 space-y-3">
                <p className="text-xs text-[#b1b1b1] uppercase tracking-widest">Neuer Eintrag</p>
                <div>
                  <label className="text-xs text-[#888] mb-1.5 block">Baustelle (optional)</label>
                  <input type="text" value={form.baustelle} onChange={e => setForm(f => ({ ...f, baustelle: e.target.value }))}
                    placeholder="Name oder Adresse"
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                </div>
                {projekte.length > 0 && (
                  <div>
                    <label className="text-xs text-[#888] mb-1.5 block">Projekt</label>
                    <select value={form.projekt_id} onChange={e => setForm(f => ({ ...f, projekt_id: e.target.value }))}
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
                  <span className="text-xs text-[#777]">{aufnahme ? 'Läuft — nochmal klicken zum Stoppen' : 'Sprechen oder tippen'}</span>
                </div>
                <textarea value={form.eingabe} onChange={e => setForm(f => ({ ...f, eingabe: e.target.value }))}
                  placeholder="Was wurde gemacht? Wieviele Arbeiter? Lieferungen? Besuche? Besonderheiten?"
                  rows={4}
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl p-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] resize-none transition-colors"/>
                <div>
                  <input ref={fotoInput} type="file" accept="image/*" multiple onChange={fotoHinzufuegen} className="hidden"/>
                  <button type="button" onClick={() => fotoInput.current?.click()}
                    className="w-full py-2.5 border border-dashed border-[#2a2a2a] rounded-xl text-xs text-[#b1b1b1] hover:border-[#d4e840] hover:text-[#d4e840] transition-all flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round"/>
                    </svg>
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
                <div className="bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[#00D4AA]/50 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                  </svg>
                  <p className="text-xs text-[#777]">Wird nach 30 Min automatisch GoBD-versiegelt</p>
                </div>
                <button type="button" onClick={handleSpeichern} disabled={saving || !form.eingabe.trim()}
                  className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all text-sm flex items-center justify-center gap-2">
                  {saving
                    ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Speichern...</>
                    : 'Eintrag speichern · 1 Token'}
                </button>
              </div>
            </div>
          )}

          {/* ── Einträge-Liste ── */}
          <div className={erstellen ? 'lg:col-span-2' : 'lg:col-span-3'}>

            {/* ── Filter-Tabs ── */}
            {filterTabs.length > 1 && (
              <div className="mb-5">

                {/* ── MOBILE: Alle + Ohne Projekt als feste Buttons, Projekte ausklappbar ── */}
                <div className="sm:hidden space-y-2">
                  {/* Zeile 1: Alle + Ohne Projekt */}
                  <div className={`grid gap-2 ${eintraege.some(e => !e.projekt_id) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {/* Alle */}
                    <button
                      type="button"
                      onClick={() => setActiveProjekt('alle')}
                      className={`relative py-3 px-3 rounded-xl text-sm font-medium transition-all ${
                        activeProjekt === 'alle' ? 'bg-[#d4e840] text-black' : 'bg-[#181818] border border-[#2a2a2a] text-[#bbb]'
                      }`}
                    >
                      Alle
                      <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        activeProjekt === 'alle' ? 'bg-[#00D4AA] text-black' : 'bg-[#2a2a2a] text-[#777]'
                      }`}>{filterTabs.find(t => t.id === 'alle')?.count}</span>
                    </button>

                    {/* Ohne Projekt */}
                    {eintraege.some(e => !e.projekt_id) && (
                      <button
                        type="button"
                        onClick={() => setActiveProjekt('kein-projekt')}
                        className={`relative py-3 px-3 rounded-xl text-sm font-medium transition-all ${
                          activeProjekt === 'kein-projekt' ? 'bg-[#d4e840] text-black' : 'bg-[#181818] border border-[#2a2a2a] text-[#bbb]'
                        }`}
                      >
                        Ohne Projekt
                        <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                          activeProjekt === 'kein-projekt' ? 'bg-[#00D4AA] text-black' : 'bg-[#2a2a2a] text-[#777]'
                        }`}>{filterTabs.find(t => t.id === 'kein-projekt')?.count}</span>
                      </button>
                    )}
                  </div>

                  {/* Zeile 2: Projekte – ausklappbarer Dropdown-Button */}
                  {projektTabs.length > 0 && (
                    <div>
                      {/* Toggle-Button */}
                      <button
                        type="button"
                        onClick={() => setProjektDropdownOffen(o => !o)}
                        className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all border ${
                          projektTabs.some(t => t.id === activeProjekt)
                            ? 'bg-[#d4e840]/10 border-[#d4e840]/40 text-[#d4e840]'
                            : 'bg-[#181818] border-[#2a2a2a] text-[#bbb]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="round"/>
                          </svg>
                          {projektTabs.some(t => t.id === activeProjekt)
                            ? aktiverTab?.label
                            : `Projekte (${projektTabs.length})`}
                        </span>
                        <svg
                          className={`w-4 h-4 opacity-50 transition-transform duration-200 ${projektDropdownOffen ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                        >
                          <path d="M19 9l-7 7-7-7" strokeLinecap="round"/>
                        </svg>
                      </button>

                      {/* Ausgeklappte Projekte – je eine Zeile */}
                      {projektDropdownOffen && (
                        <div className="mt-1.5 space-y-1.5 pl-1">
                          {projektTabs.map(tab => (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => {
                                setActiveProjekt(tab.id)
                                setProjektDropdownOffen(false)
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all border ${
                                activeProjekt === tab.id
                                  ? 'bg-[#d4e840] text-black border-transparent font-medium'
                                  : 'bg-[#141414] border-[#2a2a2a] text-[#bbb] hover:border-[#444] hover:text-[#f0ede8]'
                              }`}
                            >
                              <span className="truncate text-left">{tab.label}</span>
                              <span className={`ml-2 flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                                activeProjekt === tab.id ? 'bg-black/20 text-black' : 'bg-[#2a2a2a] text-[#777]'
                              }`}>{tab.count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── DESKTOP: einfache Zeile wie bisher ── */}
                <div className="hidden sm:flex gap-2 flex-wrap">
                  {filterTabs.map(tab => (
                    <button key={tab.id} type="button" onClick={() => setActiveProjekt(tab.id)}
                      className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
                        activeProjekt === tab.id ? 'bg-[#d4e840] text-black font-medium' : 'bg-[#181818] border border-[#2a2a2a] text-[#aaa] hover:text-[#f0ede8]'
                      }`}>
                      {tab.label}
                      <span className="ml-1.5 text-xs opacity-60">{tab.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Suchergebnis-Info */}
            {sucheNormalisiert && (
              <p className="text-xs text-[#b1b1b1] mb-4">
                {gefiltert.length === 0
                  ? 'Keine Einträge gefunden'
                  : `${gefiltert.length} Eintrag${gefiltert.length !== 1 ? 'e' : ''} gefunden`}
              </p>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/>
              </div>
            ) : gefiltert.length === 0 ? (
              <div className="border border-dashed border-[#2a2a2a] rounded-2xl p-16 text-center">
                <p className="text-[#b1b1b1] mb-3">{sucheNormalisiert ? 'Keine Einträge für diese Suche' : 'Noch keine Einträge'}</p>
                {!sucheNormalisiert && (
                  <button type="button" onClick={() => setErstellen(true)} className="text-[#d4e840] text-sm hover:opacity-75">
                    Ersten Eintrag erstellen →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {gefiltert.map(eintrag => {
                  const projektName  = getProjektName(eintrag.projekt_id)
                  const restzeit     = !eintrag.finalisiert ? getRestzeit(eintrag.erfasst_am || eintrag.datum) : null
                  const istBearbeiten = bearbeitenId === eintrag.id

                  return (
                    <div key={eintrag.id}
                      className={`bg-[#181818] border rounded-2xl p-4 sm:p-5 ${eintrag.finalisiert ? 'border-[#00D4AA]/20' : 'border-[#2a2a2a]'}`}>

                      {/* ── Card Header ── */}
                      <div className="mb-3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-[#f0ede8] text-base leading-tight">{eintrag.baustelle}</h3>
                          {eintrag.finalisiert ? (
                            <span className="text-xs bg-[#00D4AA]/10 text-[#00D4AA] px-2 py-0.5 rounded-full border border-[#00D4AA]/20 flex items-center gap-1 flex-shrink-0">
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                              </svg>
                              GoBD · V{eintrag.version}
                            </span>
                          ) : restzeit ? (
                            <span className="text-xs text-[#d4e840]/70 flex items-center gap-1 flex-shrink-0">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/>
                              </svg>
                              Siegel in {restzeit}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <p className="text-sm text-[#888]">
                            {new Date(eintrag.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                          {eintrag.wetter && (
                            <span className="text-xs text-[#777] flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/>
                              </svg>
                              {eintrag.wetter}
                            </span>
                          )}
                          <span className="text-xs text-[#777] flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/>
                            </svg>
                            {eintrag.arbeiter}
                          </span>
                          {projektName && (
                            <span className="text-xs bg-[#d4e840]/10 text-[#d4e840] px-2 py-0.5 rounded-full border border-[#d4e840]/20">
                              {projektName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap mt-2.5">
                          {projekte.length > 0 && (
                            <select value={eintrag.projekt_id || ''} onChange={e => eintragProjektZuweisen(eintrag.id, e.target.value)}
                              className="text-xs bg-[#111] border border-[#2a2a2a] rounded-lg pl-2 pr-5 py-1.5 text-[#888] focus:outline-none focus:border-[#d4e840] max-w-[140px]">
                              <option value="">Kein Projekt</option>
                              {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          )}
                          {eintrag.finalisiert && (
                            <button type="button" onClick={() => ladeVersionen(eintrag.id)}
                              className="text-xs px-2.5 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-[#00D4AA] hover:border-[#00D4AA]/30 transition-all flex items-center gap-1">
                              {verionenLoading === eintrag.id
                                ? <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/></svg>}
                              Versionen
                            </button>
                          )}
                          {!istBearbeiten && (
                            <button type="button" onClick={() => bearbeitenStarten(eintrag)}
                              className="text-xs px-2.5 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-[#f0ede8] hover:border-[#444] transition-all flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" strokeLinecap="round"/>
                              </svg>
                              {eintrag.finalisiert ? 'Korrektur' : 'Bearbeiten'}
                            </button>
                          )}
                          {!eintrag.finalisiert && (
                            <button type="button" onClick={() => versiegeln(eintrag.id)} disabled={finalisierend === eintrag.id}
                              className="text-xs px-2.5 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-[#888] hover:text-[#00D4AA] hover:border-[#00D4AA]/30 transition-all flex items-center gap-1 disabled:opacity-40">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                              </svg>
                              Siegeln
                            </button>
                          )}
                          <button type="button" onClick={() => eintragLoeschen(eintrag)} disabled={deletingId === eintrag.id || eintrag.finalisiert}
                            className={`ml-auto transition-colors disabled:opacity-30 ${eintrag.finalisiert ? 'text-[#333] cursor-not-allowed' : 'text-[#444] hover:text-red-400'}`}
                            title={eintrag.finalisiert ? 'GoBD: nicht löschbar' : 'Löschen'}>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* ── Bearbeiten-Formular ── */}
                      {istBearbeiten ? (
                        <div className="space-y-3 mt-2 pt-3 border-t border-[#222]">
                          {eintrag.finalisiert && (
                            <div className="bg-[#d4e840]/5 border border-[#d4e840]/20 rounded-xl px-3 py-2 text-xs text-[#d4e840]/80">
                              Finalisierter Eintrag — Änderung wird als neue Version gespeichert (GoBD-konform)
                            </div>
                          )}
                          <textarea value={bearbeitenForm.ausgefuehrte_arbeiten}
                            onChange={e => setBearbeitenForm(f => ({ ...f, ausgefuehrte_arbeiten: e.target.value }))}
                            rows={3}
                            className="w-full bg-[#111] border border-[#d4e840]/40 rounded-xl p-3 text-sm text-[#f0ede8] focus:outline-none focus:border-[#d4e840] resize-none transition-colors"/>
                          <div className="grid grid-cols-2 gap-2">
                            {[['lieferungen','Lieferungen'],['besuche','Besuche'],['besonderheiten','Besonderheiten'],['wetter','Wetter']].map(([key, label]) => (
                              <input key={key} type="text"
                                value={(bearbeitenForm as any)[key]}
                                onChange={e => setBearbeitenForm(f => ({ ...f, [key]: e.target.value }))}
                                placeholder={label}
                                className="bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                            ))}
                          </div>
                          {eintrag.finalisiert && (
                            <input type="text" value={bearbeitenForm.grund}
                              onChange={e => setBearbeitenForm(f => ({ ...f, grund: e.target.value }))}
                              placeholder="Änderungsgrund * (z.B. Tippfehler korrigiert)"
                              className="w-full bg-[#111] border border-red-500/30 rounded-xl px-3 py-2 text-sm text-[#f0ede8] placeholder-[#666] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                          )}
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setBearbeitenId(null)}
                              className="flex-1 py-2 rounded-xl border border-[#2a2a2a] text-sm text-[#888] hover:text-[#f0ede8] transition-all">
                              Abbrechen
                            </button>
                            <button type="button" onClick={bearbeitenSpeichern} disabled={bearbeitenSaving || (eintrag.finalisiert && !bearbeitenForm.grund.trim())}
                              className="flex-1 py-2 rounded-xl bg-[#d4e840] text-black text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-all">
                              {bearbeitenSaving ? 'Speichern…' : eintrag.finalisiert ? 'Als neue Version speichern' : 'Speichern'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 pt-3 border-t border-[#222]">
                          <p className="text-sm text-[#ddd] leading-relaxed">{eintrag.ausgefuehrte_arbeiten}</p>
                          {eintrag.lieferungen && (
                            <p className="text-xs text-[#aaa]">
                              <span className="text-[#b1b1b1]">Lieferung: </span>{eintrag.lieferungen}
                            </p>
                          )}
                          {eintrag.besuche && (
                            <p className="text-xs text-[#aaa]">
                              <span className="text-[#b1b1b1]">Besuche: </span>{eintrag.besuche}
                            </p>
                          )}
                          {eintrag.besonderheiten && (
                            <div className="bg-[#d4e840]/5 border border-[#d4e840]/20 rounded-xl p-3 mt-2">
                              <p className="text-xs text-[#d4e840] mb-1">Besonderheit</p>
                              <p className="text-sm text-[#ddd]">{eintrag.besonderheiten}</p>
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

                      {/* ── GoBD Siegel-Info ── */}
                      {eintrag.finalisiert && eintrag.hash_sha256 && !istBearbeiten && (
                        <div className="mt-3 pt-3 border-t border-[#222]">
                          <div className="flex items-start gap-2">
                            <svg className="w-3.5 h-3.5 text-[#00D4AA]/50 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                            </svg>
                            <div className="min-w-0">
                              <p className="text-xs text-[#aaa]">
                                Versiegelt {new Date(eintrag.finalisiert_am!).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="font-mono text-[10px] text-[#888] truncate mt-0.5">{eintrag.hash_sha256}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Versionshistorie ── */}
                      {zeigeVersionen === eintrag.id && versionen[eintrag.id] && (
                        <div className="mt-3 pt-3 border-t border-[#222]">
                          <p className="text-xs text-[#777] uppercase tracking-wider mb-2">Versionshistorie</p>
                          <div className="space-y-2">
                            {versionen[eintrag.id].length === 0 ? (
                              <p className="text-xs text-[#b1b1b1]">Keine früheren Versionen</p>
                            ) : (() => {
                              const DIFF_FELDER = [
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
                                const next  = idx < alle.length - 1 ? alle[idx + 1].snapshot : eintrag
                                const prev  = v.snapshot as Record<string, any>
                                const diffs = DIFF_FELDER.filter(f => String(prev[f.key] ?? null) !== String((next as any)[f.key] ?? null))
                                return (
                                  <div key={v.id} className="bg-[#111] rounded-xl p-3 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-[#d4e840] font-mono font-bold">V{v.version}</span>
                                        <span className="text-xs text-[#888]">{v.grund}</span>
                                      </div>
                                      <span className="text-[10px] text-[#b1b1b1] flex-shrink-0">
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
                                              <p className="text-[#b1b1b1] px-2 pt-1.5 pb-0.5">{f.label}</p>
                                              <div className="grid grid-cols-2 divide-x divide-[#1a1a1a]">
                                                <div className="bg-red-500/5 px-2 py-1.5">
                                                  <p className="text-[10px] text-red-400/50 mb-0.5">Vorher</p>
                                                  <p className="text-[#999] leading-relaxed break-words">{String(vorher)}</p>
                                                </div>
                                                <div className="bg-[#00D4AA]/5 px-2 py-1.5">
                                                  <p className="text-[10px] text-[#00D4AA]/50 mb-0.5">Nachher</p>
                                                  <p className="text-[#ddd] leading-relaxed break-words">{String(nachher)}</p>
                                                </div>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-[#b1b1b1] italic">Keine inhaltlichen Änderungen in diesem Snapshot</p>
                                    )}
                                    <p className="font-mono text-[9px] text-[#555] truncate">{v.hash_sha256}</p>
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
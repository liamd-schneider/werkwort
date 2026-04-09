'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Eintrag {
  id: string; baustelle: string; datum: string; arbeiter: number
  ausgefuehrte_arbeiten: string; lieferungen: string | null
  besuche: string | null; besonderheiten: string | null
  wetter: string | null; fotos: string[] | null; projekt_id: string | null
}
interface Projekt { id: string; name: string; kunde_name: string }

export default function BautagebuchPage() {
  const router = useRouter()
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [loading, setLoading] = useState(true)
  const [wetter, setWetter] = useState('')
  const [wetterLoading, setWetterLoading] = useState(false)
  const [activeProjekt, setActiveProjekt] = useState('alle')
  const [erstellen, setErstellen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aufnahme, setAufnahme] = useState(false)
  const [fotos, setFotos] = useState<File[]>([])
  const [fotoUrls, setFotoUrls] = useState<string[]>([])
  const [form, setForm] = useState({ eingabe: '', baustelle: '', projekt_id: '' })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks  = useRef<Blob[]>([])
  const fotoInput    = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData(); ladeWetter() }, [])

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
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        const fd   = new FormData(); fd.append('file', blob, 'audio.webm')
        const res  = await fetch('/api/transcribe', { method: 'POST', body: fd })
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

    // Fotos hochladen
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

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/bautagebuch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        eingabe:    form.eingabe,
        baustelle:  form.baustelle || 'Baustelle',
        wetter:     wetter || null,
        projekt_id: form.projekt_id || null,
        fotos:      uploads,
      }),
    })

    if (res.ok) {
      setForm({ eingabe: '', baustelle: '', projekt_id: '' })
      setFotos([]); setFotoUrls([])
      setErstellen(false)
      loadData()
    }
    setSaving(false)
  }

  // Eintrag + Fotos löschen
  const eintragLoeschen = async (eintrag: Eintrag) => {
    if (!confirm(`Eintrag vom ${new Date(eintrag.datum).toLocaleDateString('de-DE')} wirklich löschen?`)) return
    setDeletingId(eintrag.id)

    // Fotos aus Storage löschen
    if (eintrag.fotos && eintrag.fotos.length > 0) {
      const paths = eintrag.fotos.map(url => {
        // URL → Storage-Pfad extrahieren
        const parts = url.split('/bautagebuch-fotos/')
        return parts[1]?.split('?')[0]
      }).filter(Boolean)
      if (paths.length > 0) {
        await supabase.storage.from('bautagebuch-fotos').remove(paths)
      }
    }

    await (supabase as any).from('bautagebuch').delete().eq('id', eintrag.id)
    setEintraege(prev => prev.filter(e => e.id !== eintrag.id))
    setDeletingId(null)
  }

  const eintragProjektZuweisen = async (eintragId: string, projektId: string) => {
    await (supabase as any).from('bautagebuch').update({ projekt_id: projektId || null }).eq('id', eintragId)
    setEintraege(prev => prev.map(e => e.id === eintragId ? { ...e, projekt_id: projektId || null } : e))
  }

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
          {/* Wetter editierbar */}
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
                    placeholder="Name oder Adresse der Baustelle"
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

                {/* Fotos */}
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

                <button type="button" onClick={handleSpeichern}
                  disabled={saving || !form.eingabe.trim()}
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
                { id: 'alle',          label: `Alle (${eintraege.length})` },
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
                  return (
                    <div key={eintrag.id} className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{eintrag.baustelle}</p>
                          <p className="text-sm text-[#555] mt-0.5">
                            {new Date(eintrag.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                          {eintrag.wetter && <span className="text-xs text-[#555]">{eintrag.wetter}</span>}
                          <span className="text-xs text-[#555] flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/></svg>
                            {eintrag.arbeiter}
                          </span>
                          {/* Projekt inline zuweisen */}
                          <select value={eintrag.projekt_id || ''} onChange={e => eintragProjektZuweisen(eintrag.id, e.target.value)}
                            className="text-xs bg-[#111] border border-[#2a2a2a] rounded-lg px-2 py-1 text-[#555] focus:outline-none focus:border-[#d4e840] max-w-[130px]">
                            <option value="">Kein Projekt</option>
                            {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {/* Löschen */}
                          <button type="button" onClick={() => eintragLoeschen(eintrag)}
                            disabled={deletingId === eintrag.id}
                            className="text-[#333] hover:text-red-400 transition-colors disabled:opacity-40" title="Eintrag löschen">
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

                      <div className="space-y-2">
                        <p className="text-sm text-[#ccc] leading-relaxed">{eintrag.ausgefuehrte_arbeiten}</p>
                        {eintrag.lieferungen && (
                          <p className="text-xs text-[#555]"><span className="text-[#444]">Lieferung: </span>{eintrag.lieferungen}</p>
                        )}
                        {eintrag.besuche && (
                          <p className="text-xs text-[#555]"><span className="text-[#444]">Besuche: </span>{eintrag.besuche}</p>
                        )}
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
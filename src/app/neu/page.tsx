'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDokument } from '@/hooks/useDokument'
import { TOKEN_KOSTEN, DokumentTyp } from '@/types'
import { supabase } from '@/lib/supabase'

const DOKUMENT_TYPEN = [
  {
    id: 'angebot' as DokumentTyp,
    label: 'Angebot',
    desc: 'Für Kunden erstellen',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    tipp: 'Nenne Kunde, Adresse, alle Leistungen mit Maßen und den gewünschten Fertigstellungstermin.',
    beispiel: '"Angebot für Familie Müller, Gartenstraße 12. Badsanierung: 18m² Fliesen verlegen, neue Dusche einbauen, Armaturenwechsel. Bis Ende April fertig."',
  },
  {
    id: 'rechnung' as DokumentTyp,
    label: 'Rechnung',
    desc: 'Erbrachte Leistungen',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z',
    tipp: 'Beschreibe erbrachte Leistungen mit Mengen. Zahlungsziel wird automatisch auf 14 Tage gesetzt.',
    beispiel: '"Rechnung für Fa. Schmidt über Terrassenbelag 24m², 3 Tage Arbeit, Material inklusive. Zahlungsziel 14 Tage."',
  },
  {
    id: 'bautagebuch' as DokumentTyp,
    label: 'Bautagebuch',
    desc: 'Tageseintrag',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    tipp: 'Beschreibe was heute gemacht wurde, wie viele Arbeiter vor Ort waren, Lieferungen und besondere Vorkommnisse.',
    beispiel: '"Baustelle Müller. Heute zu viert, 9m² Fliesen im Bad verlegt. Lieferung Hansgrohe vollständig. Besuch Architekt Vogel, keine Beanstandungen."',
  },
]

interface Projekt { id: string; name: string; kunde_name: string }

export default function NeuPage() {
  const router = useRouter()
  const { generieren, loading, error } = useDokument()

  const [eingabe, setEingabe] = useState('')
  const [baustelle, setBaustelle] = useState('')
  const [aufnahme, setAufnahme] = useState(false)
  const [transkribiert, setTranskribiert] = useState(false)
  const [selectedTyp, setSelectedTyp] = useState<DokumentTyp>('angebot')

  // Projekt (nur Bautagebuch)
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [projektId, setProjektId] = useState('')

  // Fotos (nur Bautagebuch)
  const [fotos, setFotos] = useState<File[]>([])
  const [fotoUrls, setFotoUrls] = useState<string[]>([])
  const fotoInput = useRef<HTMLInputElement>(null)

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])

  const typDef = DOKUMENT_TYPEN.find(t => t.id === selectedTyp)!

  useEffect(() => {
    if (selectedTyp !== 'bautagebuch') return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      ;(supabase as any).from('projekte').select('id,name,kunde_name').eq('user_id', user.id).order('name')
        .then(({ data }: { data: Projekt[] }) => setProjekte(data || []))
    })
  }, [selectedTyp])

  const startAufnahme = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current = []
      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data)
      mediaRecorder.current.onstop = async () => {
        setTranskribiert(true)
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        const fd = new FormData()
        fd.append('file', blob, 'audio.webm')
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const { text } = await res.json()
        if (text) setEingabe(prev => prev ? prev + ' ' + text : text)
        stream.getTracks().forEach(t => t.stop())
        setTranskribiert(false)
      }
      mediaRecorder.current.start()
      setAufnahme(true)
    } catch {
      alert('Mikrofon-Zugriff verweigert')
    }
  }

  const stopAufnahme = () => {
    mediaRecorder.current?.stop()
    setAufnahme(false)
  }

  const fotoHinzufuegen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setFotos(prev => [...prev, ...files])
    setFotoUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  const fotoEntfernen = (i: number) => {
    setFotos(prev => prev.filter((_, idx) => idx !== i))
    setFotoUrls(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleErstellen = async () => {
    if (!eingabe.trim()) return
    if (selectedTyp === 'bautagebuch' && !baustelle.trim()) {
      alert('Bitte gib eine Baustelle an')
      return
    }

    if (selectedTyp === 'bautagebuch') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const session = (await supabase.auth.getSession()).data.session

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

      const res = await fetch('/api/bautagebuch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          eingabe,
          baustelle,
          wetter: null,
          projekt_id: projektId || null,
          fotos: uploads,
        }),
      })
      if (res.ok) router.push('/bautagebuch')
      return
    }

    const result = await generieren(eingabe, selectedTyp, baustelle || undefined)
    if (!result) return
    if (result.dokument) router.push(`/dokumente/${result.dokument.id}`)
  }

  const istLadend = loading || transkribiert

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Top Bar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-[#888] hover:text-[#ccc] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <h1 className="text-lg font-medium text-white">Neu erstellen</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#999]">Kostet</span>
          <span className="text-[#d4e840] font-medium">{TOKEN_KOSTEN[selectedTyp]} Token</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ─── Links ─── */}
          <div className="flex flex-col gap-6">

            {/* Typ-Auswahl */}
            <div>
              <p className="text-xs text-[#999] uppercase tracking-widest mb-3">Dokumenttyp</p>
              <div className="grid grid-cols-2 gap-2">
                {DOKUMENT_TYPEN.map((typ) => (
                  <button
                    key={typ.id}
                    type="button"
                    onClick={() => { setSelectedTyp(typ.id); setEingabe(''); setFotos([]); setFotoUrls([]); setProjektId('') }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedTyp === typ.id
                        ? 'border-[#d4e840] bg-[#d4e840]/10'
                        : 'border-[#2a2a2a] bg-[#181818] hover:border-[#444]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <svg
                        className={`w-5 h-5 ${selectedTyp === typ.id ? 'text-[#d4e840]' : 'text-[#888]'}`}
                        fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                      >
                        <path d={typ.icon} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedTyp === typ.id
                          ? 'bg-[#d4e840]/20 text-[#d4e840]'
                          : 'bg-[#2a2a2a] text-[#999]'
                      }`}>
                        {TOKEN_KOSTEN[typ.id]} Token
                      </span>
                    </div>
                    <div className="font-medium text-sm text-white">{typ.label}</div>
                    <div className="text-xs text-[#999] mt-0.5">{typ.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Bautagebuch-spezifische Felder */}
            {selectedTyp === 'bautagebuch' && (
              <>
                <div>
                  <p className="text-xs text-[#999] uppercase tracking-widest mb-2">Baustelle *</p>
                  <input
                    type="text"
                    value={baustelle}
                    onChange={e => setBaustelle(e.target.value)}
                    placeholder="z.B. Müller, Gartenstraße 12"
                    className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#d4e840] transition-colors"
                  />
                </div>

                <div>
                  <p className="text-xs text-[#999] uppercase tracking-widest mb-2">Projekt</p>
                  <select
                    value={projektId}
                    onChange={e => setProjektId(e.target.value)}
                    className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d4e840] transition-colors"
                  >
                    <option value="">Kein Projekt</option>
                    {projekte.map(p => (
                      <option key={p.id} value={p.id}>{p.name} · {p.kunde_name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Mikrofon */}
            <div>
              <p className="text-xs text-[#999] uppercase tracking-widest mb-3">Spracheingabe</p>
              <div className={`border rounded-xl p-6 flex flex-col items-center gap-4 transition-all ${
                aufnahme
                  ? 'border-red-500/50 bg-red-500/5'
                  : transkribiert
                  ? 'border-[#00D4AA]/40 bg-[#00D4AA]/5'
                  : 'border-[#2a2a2a] bg-[#181818]'
              }`}>
                <button
                  type="button"
                  onClick={aufnahme ? stopAufnahme : startAufnahme}
                  disabled={transkribiert}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    aufnahme
                      ? 'bg-red-500 animate-pulse'
                      : transkribiert
                      ? 'bg-[#00D4AA]/20 cursor-not-allowed'
                      : 'bg-[#d4e840] hover:scale-105'
                  }`}
                >
                  {transkribiert ? (
                    <svg className="animate-spin w-6 h-6 text-[#00D4AA]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : aufnahme ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="9" y="2" width="6" height="12" rx="3"/>
                      <path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
                <p className={`text-sm text-center ${transkribiert ? 'text-[#00D4AA]' : 'text-[#aaa]'}`}>
                  {transkribiert
                    ? 'Text wird transkribiert…'
                    : aufnahme
                    ? 'Aufnahme läuft — nochmal klicken zum Stoppen'
                    : 'Klicken und beschreiben'}
                </p>
              </div>
            </div>

            {/* Fotos — nur bei Bautagebuch */}
            {selectedTyp === 'bautagebuch' && (
              <div>
                <p className="text-xs text-[#999] uppercase tracking-widest mb-2">Fotos</p>
                <input
                  ref={fotoInput}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={fotoHinzufuegen}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fotoInput.current?.click()}
                  className="w-full py-3 border border-dashed border-[#2a2a2a] rounded-xl text-xs text-[#999] hover:border-[#00D4AA] hover:text-[#00D4AA] transition-all flex items-center justify-center gap-2"
                >
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
                        <button
                          type="button"
                          onClick={() => fotoEntfernen(i)}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ─── Rechts ─── */}
          <div className="flex flex-col gap-6">

            <div>
              <p className="text-xs text-[#999] uppercase tracking-widest mb-3">Beschreibung</p>
              <textarea
                value={eingabe}
                onChange={e => setEingabe(e.target.value)}
                placeholder={typDef.beispiel}
                rows={10}
                className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl p-4 text-sm text-white placeholder-[#888] focus:outline-none focus:border-[#d4e840] resize-none transition-colors leading-relaxed"
              />
              <p className="text-xs text-[#777] mt-1.5 text-right">{eingabe.length} Zeichen</p>
            </div>

            {/* Tipp-Box */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-xs text-[#999] uppercase tracking-widest mb-2">
                Tipp für {typDef.label}
              </p>
              <p className="text-xs text-[#bbb] leading-relaxed">{typDef.tipp}</p>
            </div>

            {/* GoBD-Hinweis — nur bei Bautagebuch */}
            {selectedTyp === 'bautagebuch' && (
              <div className="bg-[#00D4AA]/10 border border-[#00D4AA]/30 rounded-xl px-4 py-3 flex items-center gap-3">
                <svg className="w-4 h-4 text-[#00D4AA] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                </svg>
                <p className="text-xs text-[#00D4AA]">Wird nach 30 Min automatisch GoBD-versiegelt</p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm flex items-start gap-3">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleErstellen}
              disabled={istLadend || !eingabe.trim() || (selectedTyp === 'bautagebuch' && !baustelle.trim())}
              className="w-full bg-[#d4e840] text-black font-medium py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-base"
            >
              {istLadend ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {transkribiert ? 'Text wird transkribiert…' : `KI erstellt ${typDef.label}…`}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {typDef.label} erstellen · {TOKEN_KOSTEN[selectedTyp]} Token
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
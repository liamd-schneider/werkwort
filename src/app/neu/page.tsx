'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDokument } from '@/hooks/useDokument'
import { TOKEN_KOSTEN, DokumentTyp } from '@/types'

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
    id: 'bauvertrag' as DokumentTyp,
    label: 'Bauvertrag',
    desc: 'VOB/BGB-konform',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    tipp: 'Beschreibe Auftraggeber, alle Leistungen, Festpreis und Zeitraum. Gewährleistung und Zahlungsbedingungen werden automatisch ergänzt.',
    beispiel: '"Bauvertrag für Herrn Weber, Fliesenarbeiten Erdgeschoss und Bad, Festpreis 8.500 Euro, Ausführung März bis Mai."',
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

export default function NeuPage() {
  const router = useRouter()
  const { generieren, loading, error } = useDokument()

  const [eingabe, setEingabe] = useState('')
  const [baustelle, setBaustelle] = useState('')
  const [aufnahme, setAufnahme] = useState(false)
  const [selectedTyp, setSelectedTyp] = useState<DokumentTyp>('angebot')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioChunks = useRef<Blob[]>([])

  const typDef = DOKUMENT_TYPEN.find(t => t.id === selectedTyp)!

  const startAufnahme = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current = []
      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data)
      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' })
        const fd = new FormData()
        fd.append('file', blob, 'audio.webm')
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const { text } = await res.json()
        if (text) setEingabe(prev => prev ? prev + ' ' + text : text)
        stream.getTracks().forEach(t => t.stop())
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

  const handleErstellen = async () => {
    if (!eingabe.trim()) return
    if (selectedTyp === 'bautagebuch' && !baustelle.trim()) {
      alert('Bitte gib eine Baustelle an')
      return
    }

    const result = await generieren(eingabe, selectedTyp, baustelle || undefined)
    if (!result) return

    if (result.typ === 'bautagebuch') {
      router.push('/bautagebuch')
    } else if (result.dokument) {
      router.push(`/dokumente/${result.dokument.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Top Bar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-[#555] hover:text-[#888] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <h1 className="text-lg font-medium">Neu erstellen</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#555]">Kostet</span>
          <span className="text-[#d4e840] font-medium">{TOKEN_KOSTEN[selectedTyp]} Token</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* ─── Links ─── */}
          <div className="flex flex-col gap-6">

            {/* Typ-Auswahl */}
            <div>
              <p className="text-xs text-[#444] uppercase tracking-widest mb-3">Dokumenttyp</p>
              <div className="grid grid-cols-2 gap-2">
                {DOKUMENT_TYPEN.map((typ) => (
                  <button
                    key={typ.id}
                    type="button"
                    onClick={() => { setSelectedTyp(typ.id); setEingabe('') }}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedTyp === typ.id
                        ? 'border-[#d4e840] bg-[#d4e840]/10'
                        : 'border-[#2a2a2a] bg-[#181818] hover:border-[#444]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <svg
                        className={`w-5 h-5 ${selectedTyp === typ.id ? 'text-[#d4e840]' : 'text-[#555]'}`}
                        fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                      >
                        <path d={typ.icon} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        selectedTyp === typ.id
                          ? 'bg-[#d4e840]/20 text-[#d4e840]'
                          : 'bg-[#2a2a2a] text-[#555]'
                      }`}>
                        {TOKEN_KOSTEN[typ.id]} Token
                      </span>
                    </div>
                    <div className="font-medium text-sm">{typ.label}</div>
                    <div className="text-xs text-[#555] mt-0.5">{typ.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Baustelle — nur bei Bautagebuch */}
            {selectedTyp === 'bautagebuch' && (
              <div>
                <p className="text-xs text-[#444] uppercase tracking-widest mb-2">Baustelle *</p>
                <input
                  type="text"
                  value={baustelle}
                  onChange={e => setBaustelle(e.target.value)}
                  placeholder="z.B. Müller, Gartenstraße 12"
                  className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"
                />
              </div>
            )}

            {/* Mikrofon */}
            <div>
              <p className="text-xs text-[#444] uppercase tracking-widest mb-3">Spracheingabe</p>
              <div className={`border rounded-xl p-6 flex flex-col items-center gap-4 transition-all ${
                aufnahme ? 'border-red-500/50 bg-red-500/5' : 'border-[#2a2a2a] bg-[#181818]'
              }`}>
                <button
                  type="button"
                  onClick={aufnahme ? stopAufnahme : startAufnahme}
                  disabled={loading}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    aufnahme ? 'bg-red-500 animate-pulse' : 'bg-[#d4e840] hover:scale-105'
                  }`}
                >
                  {aufnahme ? (
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
                <p className="text-sm text-[#555] text-center">
                  {aufnahme ? 'Aufnahme läuft — nochmal klicken zum Stoppen' : 'Klicken und beschreiben'}
                </p>
              </div>
            </div>

          </div>

          {/* ─── Rechts ─── */}
          <div className="flex flex-col gap-6">

            <div>
              <p className="text-xs text-[#444] uppercase tracking-widest mb-3">Beschreibung</p>
              <textarea
                value={eingabe}
                onChange={e => setEingabe(e.target.value)}
                placeholder={typDef.beispiel}
                rows={10}
                className="w-full bg-[#181818] border border-[#2a2a2a] rounded-xl p-4 text-sm text-[#f0ede8] placeholder-[#3a3a3a] focus:outline-none focus:border-[#d4e840] resize-none transition-colors leading-relaxed"
              />
              <p className="text-xs text-[#333] mt-1.5 text-right">{eingabe.length} Zeichen</p>
            </div>

            <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-2">
                Tipp für {typDef.label}
              </p>
              <p className="text-xs text-[#555] leading-relaxed">{typDef.tipp}</p>
            </div>

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
              disabled={loading || !eingabe.trim() || (selectedTyp === 'bautagebuch' && !baustelle.trim())}
              className="w-full bg-[#d4e840] text-black font-medium py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-base"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  KI erstellt {typDef.label}...
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
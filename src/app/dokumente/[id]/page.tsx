'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Dokument, DokumentStatus, AngebotPosition } from '@/types'


const STATUS_LABELS: Record<DokumentStatus, string> = {
  entwurf: 'Entwurf', offen: 'Offen', gesendet: 'Gesendet', angenommen: 'Angenommen',
  bezahlt: 'Bezahlt', abgelehnt: 'Abgelehnt', ueberfaellig: 'Überfällig',
}
const STATUS_COLORS: Record<DokumentStatus, string> = {
  entwurf:    'bg-[#2a2a2a] text-[#aaa]',
  offen:      'bg-[#d4e840]/15 text-[#d4e840]',
  gesendet:   'bg-blue-500/15 text-blue-400',
  angenommen: 'bg-[#00D4AA]/15 text-[#00D4AA]',
  bezahlt:    'bg-[#00D4AA]/15 text-[#00D4AA]',
  abgelehnt:  'bg-red-500/15 text-red-400',
  ueberfaellig: 'bg-red-500/15 text-red-400',
}

function EditableText({ value, onChange, placeholder = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  if (!editing) return (
    <button type="button" onClick={() => setEditing(true)}
      className="text-left group flex items-center gap-1.5 hover:text-[#d4e840] transition-colors w-full">
      <span className={value ? '' : 'text-[#555] italic text-sm'}>{value || placeholder}</span>
      <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 text-[#d4e840] flex-shrink-0"
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    </button>
  )
  return (
    <input autoFocus type="text" value={value} onChange={e => onChange(e.target.value)}
      onBlur={() => setEditing(false)} onKeyDown={e => e.key === 'Enter' && setEditing(false)}
      placeholder={placeholder}
      className="w-full bg-[#111] border border-[#d4e840] rounded-lg px-3 py-1.5 text-sm text-[#f0ede8] focus:outline-none"/>
  )
}

export default function DokumentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [dok, setDok] = useState<Dokument | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [converting, setConverting] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [kundeEmail, setKundeEmail] = useState('')
  const [emailDialog, setEmailDialog] = useState(false)
  const [kiDialog, setKiDialog]         = useState(false)
  const [zugferdLoading, setZugferdLoad] = useState(false)
  const [finalisiert, setFinalisiert]    = useState(false)
  const [kiAktion, setKiAktion]         = useState<'senden'|'zugferd'|null>(null)

  useEffect(() => { loadDokument() }, [])

  const loadDokument = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }
    const { data } = await (supabase as any).from('dokumente').select('*')
      .eq('id', params.id).eq('user_id', user.id).single()
    setDok(data)
    if (data?.finalisiert) setFinalisiert(true)
    setLoading(false)
  }

  const set = (field: keyof Dokument, value: any) => {
    if (!dok) return
    setDok({ ...dok, [field]: value })
  }

  const updatePos = (i: number, field: keyof AngebotPosition, value: string | number) => {
    if (!dok) return
    const pos = [...(dok.positionen as AngebotPosition[])]
    pos[i] = { ...pos[i], [field]: value }
    if (field === 'menge' || field === 'einzelpreis') {
      pos[i].gesamtpreis = Math.round(pos[i].menge * pos[i].einzelpreis * 100) / 100
    }
    const netto  = pos.reduce((s, p) => s + p.gesamtpreis, 0)
    const mwst   = Math.round(netto * 0.19 * 100) / 100
    setDok({ ...dok, positionen: pos, netto, mwst, brutto: Math.round((netto + mwst) * 100) / 100 })
  }

  const addPos = () => {
    if (!dok) return
    const pos = [...(dok.positionen as AngebotPosition[]),
      { beschreibung: 'Neue Position', menge: 1, einheit: 'm²', einzelpreis: 0, gesamtpreis: 0 }]
    setDok({ ...dok, positionen: pos })
  }

  const delPos = (i: number) => {
    if (!dok) return
    const pos = (dok.positionen as AngebotPosition[]).filter((_, idx) => idx !== i)
    const netto  = pos.reduce((s, p) => s + p.gesamtpreis, 0)
    const mwst   = Math.round(netto * 0.19 * 100) / 100
    setDok({ ...dok, positionen: pos, netto, mwst, brutto: Math.round((netto + mwst) * 100) / 100 })
  }

  const speichern = async () => {
    if (!dok) return
    setSaving(true)
    await (supabase as any).from('dokumente').update({
      kunde_name: dok.kunde_name, kunde_adresse: dok.kunde_adresse,
      positionen: dok.positionen, netto: dok.netto, mwst: dok.mwst, brutto: dok.brutto,
      anmerkungen: dok.anmerkungen, ausfuehrungszeitraum: dok.ausfuehrungszeitraum,
      gueltig_bis: dok.gueltig_bis, zahlungsziel: dok.zahlungsziel,
    }).eq('id', dok.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const statusAendern = async (s: DokumentStatus) => {
    if (!dok) return
    const { data, error } = await (supabase as any)
      .from('dokumente').update({ status: s }).eq('id', dok.id).select()
    if (error) return
    setDok(prev => prev ? { ...prev, status: s } : prev)
  }

  const loeschen = async () => {
    if (!dok) return
    if (!confirm(`${dok.typ.charAt(0).toUpperCase() + dok.typ.slice(1)} "${dok.nummer}" wirklich löschen?`)) return
    setDeleting(true)
    await (supabase as any).from('dokumente').delete().eq('id', dok.id)
    router.push('/dokumente')
  }

  const zuRechnungUmwandeln = async () => {
    if (!dok) return
    setConverting(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/rechnung-aus-angebot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ angebotId: dok.id }),
    })
    const result = await res.json()
    setConverting(false)
    if (result.success) router.push(`/dokumente/${result.data.id}`)
    else alert(result.error || 'Fehler bei der Umwandlung')
  }

  const pdfOeffnen = async () => {
    if (!dok) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/pdf?id=${dok.id}`, {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const html = await res.text()
    const blob = new Blob([html], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const dokSenden = async () => {
    if (!dok || !kundeEmail) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()

    if (dok.typ === 'rechnung' && !finalisiert) {
      try {
        const res = await fetch('/api/zugferd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ dokumentId: dok.id }),
        })
        const result = await res.json()
        if (result.success) {
          const bytes = Uint8Array.from(atob(result.pdf_b64), c => c.charCodeAt(0))
          const blob  = new Blob([bytes], { type: 'application/pdf' })
          const url   = URL.createObjectURL(blob)
          const a     = document.createElement('a')
          a.href = url; a.download = `${dok.nummer}_ZUGFeRD_EN16931.pdf`; a.click()
          URL.revokeObjectURL(url)
          setFinalisiert(true)
          setDok(prev => prev ? { ...prev, finalisiert: true } as any : prev)
        }
      } catch {}
    }

    const res = await fetch('/api/sende-angebot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ dokumentId: dok.id, kundeEmail }),
    })
    const result = await res.json()
    setSending(false)
    if (result.success) { setEmailDialog(false); await statusAendern('gesendet') }
    else alert(result.error || 'Fehler beim Senden')
  }

  const zugferdGenerieren = async () => {
    if (!dok) return
    setZugferdLoad(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/zugferd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ dokumentId: dok.id }),
      })
      const result = await res.json()
      if (!result.success) { alert(result.error || 'ZUGFeRD fehlgeschlagen'); return }
      const bytes = Uint8Array.from(atob(result.pdf_b64), c => c.charCodeAt(0))
      const blob  = new Blob([bytes], { type: 'application/pdf' })
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href = url; a.download = `${dok.nummer}_ZUGFeRD_EN16931.pdf`; a.click()
      URL.revokeObjectURL(url)
      setFinalisiert(true)
      setDok({ ...dok, finalisiert: true } as any)
      alert('✓ E-Rechnung (ZUGFeRD EN16931) erstellt!')
    } catch (err: any) {
      alert('Fehler: ' + err.message)
    } finally {
      setZugferdLoad(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>
  if (!dok) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center text-[#888]">Nicht gefunden</div>

  const pos = dok.positionen as AngebotPosition[]
  const edit = dok.status === 'entwurf'
  const kannSenden = dok.typ === 'angebot' || dok.typ === 'rechnung'
  const zeigeAnmerkungen = dok.anmerkungen && dok.anmerkungen.trim().length > 0

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Topbar */}
      <div className="border-b border-[#1a1a1a] px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dokumente" className="text-[#888] hover:text-[#bbb] flex-shrink-0 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-medium truncate">{dok.kunde_name}</h1>
            <p className="text-xs text-[#888]">{dok.nummer} · {dok.typ.charAt(0).toUpperCase() + dok.typ.slice(1)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {edit && <span className="hidden sm:flex text-xs text-[#d4e840] bg-[#d4e840]/10 px-3 py-1 rounded-full border border-[#d4e840]/30">✏️ Bearbeitbar</span>}
          {finalisiert && <span className="hidden sm:flex text-xs bg-[#00D4AA]/15 text-[#00D4AA] px-3 py-1 rounded-full border border-[#00D4AA]/30">🔒 GoBD-konform</span>}
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${STATUS_COLORS[dok.status as DokumentStatus]}`}>{STATUS_LABELS[dok.status as DokumentStatus]}</span>
        </div>
      </div>

      {edit && (
        <div className="bg-[#d4e840]/5 border-b border-[#d4e840]/20 px-4 sm:px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-[#d4e840]/70">Klicke auf einen Wert um ihn zu bearbeiten</p>
          <button type="button" onClick={speichern} disabled={saving}
            className="bg-[#d4e840] text-black text-xs font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40 transition-all">
            {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Speichern'}
          </button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Hauptinhalt */}
          <div className="lg:col-span-2 space-y-6">

            {/* Kunde */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6 space-y-4">
              <p className="text-xs text-[#888] uppercase tracking-widest">Auftraggeber</p>
              <div>
                <p className="text-xs text-[#888] mb-1">Name</p>
                {edit ? <EditableText value={dok.kunde_name} onChange={v => set('kunde_name', v)} placeholder="Kundenname"/> : <p className="font-medium">{dok.kunde_name}</p>}
              </div>
              <div>
                <p className="text-xs text-[#888] mb-1">Adresse</p>
                {edit ? <EditableText value={dok.kunde_adresse || ''} onChange={v => set('kunde_adresse', v)} placeholder="Straße, PLZ Ort"/> : <p className="text-sm text-[#aaa]">{dok.kunde_adresse || '—'}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-[#888] mb-1">Ausführungszeitraum</p>
                  {edit ? <EditableText value={dok.ausfuehrungszeitraum || ''} onChange={v => set('ausfuehrungszeitraum', v)} placeholder="bis Ende April"/> : <p className="text-sm">{dok.ausfuehrungszeitraum || '—'}</p>}
                </div>
                {dok.typ === 'angebot' && (
                  <div>
                    <p className="text-xs text-[#888] mb-1">Gültig bis</p>
                    {edit ? <EditableText value={dok.gueltig_bis || ''} onChange={v => set('gueltig_bis', v)} placeholder="YYYY-MM-DD"/> : <p className="text-sm">{dok.gueltig_bis ? new Date(dok.gueltig_bis).toLocaleDateString('de-DE') : '—'}</p>}
                  </div>
                )}
                {dok.typ === 'rechnung' && (
                  <div>
                    <p className="text-xs text-[#888] mb-1">Zahlungsziel (Tage)</p>
                    {edit ? <EditableText value={String(dok.zahlungsziel || 14)} onChange={v => set('zahlungsziel', parseInt(v) || 14)} placeholder="14"/> : <p className="text-sm">{dok.zahlungsziel} Tage</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Positionen */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
                <p className="text-xs text-[#888] uppercase tracking-widest">Leistungspositionen</p>
                {edit && (
                  <button type="button" onClick={addPos} className="text-xs text-[#d4e840] hover:opacity-75 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                    Position hinzufügen
                  </button>
                )}
              </div>

              {/* Desktop-Header */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-6 py-2 border-b border-[#1f1f1f] text-xs text-[#666]">
                <div className="col-span-5">Beschreibung</div>
                <div className="col-span-2 text-center">Menge</div>
                <div className="col-span-1 text-center">Einheit</div>
                <div className="col-span-2 text-right">Einzelpreis</div>
                <div className="col-span-2 text-right">Gesamt</div>
              </div>

              {pos.map((p, i) => (
                <div key={i} className={`group ${i !== pos.length - 1 ? 'border-b border-[#1f1f1f]' : ''}`}>

                  {/* ── Desktop ── */}
                  <div className="hidden md:grid grid-cols-12 gap-2 px-6 py-4 items-center">
                    <div className="col-span-5">
                      {edit
                        ? <EditableText value={p.beschreibung} onChange={v => updatePos(i, 'beschreibung', v)}/>
                        : <p className="text-sm">{p.beschreibung}</p>}
                    </div>
                    <div className="col-span-2">
                      {edit
                        ? <input type="number" value={p.menge} onChange={e => updatePos(i, 'menge', parseFloat(e.target.value) || 0)} className="w-full bg-[#111] border border-[#d4e840]/40 rounded-lg px-2 py-1 text-sm text-center text-[#f0ede8] focus:outline-none focus:border-[#d4e840]"/>
                        : <p className="text-sm text-center text-[#aaa]">{p.menge}</p>}
                    </div>
                    <div className="col-span-1">
                      {edit
                        ? <select value={p.einheit} onChange={e => updatePos(i, 'einheit', e.target.value)} className="w-full bg-[#111] border border-[#d4e840]/40 rounded-lg px-1 py-1 text-xs text-[#f0ede8] focus:outline-none">{['m²','Stk.','Std.','m','pauschal'].map(e=><option key={e}>{e}</option>)}</select>
                        : <p className="text-sm text-center text-[#aaa]">{p.einheit}</p>}
                    </div>
                    <div className="col-span-2">
                      {edit
                        ? <input type="number" value={p.einzelpreis} onChange={e => updatePos(i, 'einzelpreis', parseFloat(e.target.value) || 0)} className="w-full bg-[#111] border border-[#d4e840]/40 rounded-lg px-2 py-1 text-sm text-right text-[#f0ede8] focus:outline-none focus:border-[#d4e840]"/>
                        : <p className="text-sm text-right text-[#aaa] tabular-nums">{p.einzelpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <p className="text-sm font-medium tabular-nums">{p.gesamtpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>
                      {edit && (
                        <button type="button" onClick={() => delPos(i)} className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-red-400 transition-all">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Mobile: Name oben, Menge darunter, Preis in einer Zeile ── */}
                  <div className="md:hidden px-4 py-3.5">
                    {/* Zeile 1: vollständiger Name */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex-1 min-w-0">
                        {edit
                          ? <EditableText value={p.beschreibung} onChange={v => updatePos(i, 'beschreibung', v)}/>
                          : <p className="text-sm font-medium leading-snug">{p.beschreibung}</p>}
                      </div>
                      {edit && (
                        <button type="button" onClick={() => delPos(i)} className="text-[#555] hover:text-red-400 transition-all flex-shrink-0 mt-0.5">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </div>
                    {/* Zeile 2: Menge × Einzelpreis = Gesamt — alles in einer Zeile, kein Umbruch */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-[#888] whitespace-nowrap">
                        {p.menge} {p.einheit} × {p.einzelpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                      </p>
                      <p className="text-sm font-medium tabular-nums text-[#f0ede8] flex-shrink-0">
                        {p.gesamtpreis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                      </p>
                    </div>
                    {/* Edit-Felder für Menge/Einheit/Preis auf Handy */}
                    {edit && (
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        <input type="number" value={p.menge} onChange={e => updatePos(i, 'menge', parseFloat(e.target.value) || 0)}
                          placeholder="Menge"
                          className="bg-[#111] border border-[#d4e840]/30 rounded-lg px-2 py-1.5 text-xs text-[#f0ede8] focus:outline-none focus:border-[#d4e840] text-center"/>
                        <select value={p.einheit} onChange={e => updatePos(i, 'einheit', e.target.value)}
                          className="bg-[#111] border border-[#d4e840]/30 rounded-lg px-1 py-1.5 text-xs text-[#f0ede8] focus:outline-none">
                          {['m²','Stk.','Std.','m','pauschal'].map(e => <option key={e}>{e}</option>)}
                        </select>
                        <input type="number" value={p.einzelpreis} onChange={e => updatePos(i, 'einzelpreis', parseFloat(e.target.value) || 0)}
                          placeholder="€"
                          className="bg-[#111] border border-[#d4e840]/30 rounded-lg px-2 py-1.5 text-xs text-[#f0ede8] focus:outline-none focus:border-[#d4e840] text-right"/>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Summen */}
              <div className="border-t border-[#2a2a2a] px-6 py-4 space-y-2">
                <div className="flex justify-between text-sm text-[#aaa]"><span>Netto</span><span className="tabular-nums">{dok.netto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></div>
                <div className="flex justify-between text-sm text-[#aaa]"><span>MwSt. 19 %</span><span className="tabular-nums">{dok.mwst.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></div>
                <div className="flex justify-between text-base font-medium pt-2 border-t border-[#2a2a2a]"><span>Gesamt</span><span className="tabular-nums">{dok.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</span></div>
              </div>
            </div>

            {/* Anmerkungen */}
            {zeigeAnmerkungen && (
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <p className="text-xs text-[#888] uppercase tracking-widest mb-3">Anmerkungen</p>
                {edit ? (
                  <textarea value={dok.anmerkungen || ''} onChange={e => set('anmerkungen', e.target.value)}
                    placeholder="Zusätzliche Hinweise..." rows={3}
                    className="w-full bg-[#111] border border-[#d4e840]/40 rounded-xl p-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] resize-none"/>
                ) : (
                  <p className="text-sm text-[#aaa] leading-relaxed">{dok.anmerkungen}</p>
                )}
              </div>
            )}
            {edit && !zeigeAnmerkungen && (
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <p className="text-xs text-[#888] uppercase tracking-widest mb-3">Anmerkungen</p>
                <textarea value={dok.anmerkungen || ''} onChange={e => set('anmerkungen', e.target.value)}
                  placeholder="Optionale Hinweise für dieses Dokument..." rows={2}
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl p-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] resize-none transition-colors"/>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {edit && (
              <button type="button" onClick={speichern} disabled={saving}
                className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Änderungen speichern'}
              </button>
            )}

            {/* Aktionen */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="text-xs text-[#888] uppercase tracking-widest mb-4">Aktionen</p>
              <div className="space-y-2">
                {kannSenden && (
                  <button type="button" onClick={() => setEmailDialog(true)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#d4e840]/10 border border-[#d4e840]/30 text-sm text-[#d4e840] hover:bg-[#d4e840]/20 transition-all text-left flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round"/></svg>
                    {dok.typ === 'rechnung' ? 'Rechnung senden' : 'An Kunde senden'}
                  </button>
                )}
                {dok.typ === 'angebot' && (
                  <button type="button" onClick={zuRechnungUmwandeln} disabled={converting}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#00D4AA]/10 border border-[#00D4AA]/30 text-sm text-[#00D4AA] hover:bg-[#00D4AA]/20 transition-all text-left flex items-center gap-2 disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" strokeLinecap="round"/></svg>
                    {converting ? 'Wird umgewandelt...' : 'In Rechnung umwandeln'}
                  </button>
                )}
                <button type="button" onClick={pdfOeffnen}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#111] border border-[#2a2a2a] text-sm text-[#aaa] hover:text-[#f0ede8] hover:border-[#444] transition-all text-left flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round"/></svg>
                  PDF exportieren
                </button>
                {dok.typ === 'rechnung' && (
                  <button type="button" onClick={zugferdGenerieren} disabled={zugferdLoading}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all text-left flex items-center gap-2 disabled:opacity-40 ${
                      finalisiert
                        ? 'bg-[#00D4AA]/10 border-[#00D4AA]/30 text-[#00D4AA] cursor-default'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                    }`}>
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                    </svg>
                    {zugferdLoading ? 'Generiere E-Rechnung...' : finalisiert ? '✓ E-Rechnung (ZUGFeRD) erstellt' : 'E-Rechnung (ZUGFeRD) erstellen'}
                  </button>
                )}
                <button type="button" onClick={loeschen} disabled={deleting}
                  className="w-full px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/20 text-sm text-red-500/70 hover:text-red-400 hover:border-red-500/40 transition-all text-left flex items-center gap-2 disabled:opacity-40 mt-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round"/></svg>
                  {deleting ? 'Löschen...' : 'Löschen'}
                </button>
              </div>
            </div>

            {/* Status */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="text-xs text-[#888] uppercase tracking-widest mb-4">Status</p>
              <div className="space-y-2">
                {(Object.keys(STATUS_LABELS) as DokumentStatus[]).filter(s => s !== dok.status).map(s => (
                  <button key={s} type="button" onClick={() => statusAendern(s)}
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-[#111] border border-[#2a2a2a] text-sm text-[#aaa] hover:text-[#f0ede8] hover:border-[#444] transition-all">
                    → {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="text-xs text-[#888] uppercase tracking-widest mb-4">Details</p>
              <div className="space-y-3 text-sm">
                {[
                  ['Nummer', dok.nummer],
                  ['Typ', dok.typ.charAt(0).toUpperCase() + dok.typ.slice(1)],
                  ['Erstellt', new Date(dok.created_at).toLocaleDateString('de-DE')],
                  ['Token', String(dok.token_verbraucht)],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[#888]">{k}</span>
                    <span className="text-[#f0ede8]">{v}</span>
                  </div>
                ))}
                {finalisiert && (
                  <>
                    <div className="flex justify-between border-t border-[#2a2a2a] pt-3">
                      <span className="text-[#888]">E-Rechnung</span>
                      <span className="text-[#00D4AA] text-xs">ZUGFeRD EN16931 ✓</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#888]">GoBD-Status</span>
                      <span className="text-[#00D4AA] text-xs">Finalisiert ✓</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {dok.typ === 'rechnung' && !finalisiert && (
              <div className="bg-[#111] border border-[#2a2a2a] rounded-2xl p-4 text-xs text-[#888] leading-relaxed">
                <p className="text-[#aaa] font-medium mb-1">Was ist eine E-Rechnung?</p>
                Seit 2025 gesetzlich vorgeschrieben (B2B). ZUGFeRD EN16931 ist ein PDF mit eingebetteter XML — maschinenlesbar, DATEV-importierbar, GoBD-konform.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E-Mail Dialog */}
      {emailDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50" onClick={e => e.target === e.currentTarget && setEmailDialog(false)}>
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-medium mb-1">
              {dok.typ === 'rechnung' ? 'Rechnung senden' : 'Angebot senden'}
            </h2>
            <p className="text-sm text-[#888] mb-5">Das Dokument wird per E-Mail mit PDF-Link versendet.</p>
            <div>
              <label className="text-xs text-[#888] mb-1.5 block">E-Mail des Kunden</label>
              <input type="email" value={kundeEmail} onChange={e => setKundeEmail(e.target.value)}
                placeholder="kunde@email.de" autoFocus
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setEmailDialog(false)}
                className="flex-1 py-3 rounded-xl border border-[#2a2a2a] text-sm text-[#aaa] hover:text-[#f0ede8] transition-all">Abbrechen</button>
              <button type="button" onClick={dokSenden} disabled={sending || !kundeEmail}
                className="flex-1 py-3 rounded-xl bg-[#d4e840] text-black font-medium text-sm hover:opacity-90 disabled:opacity-40 transition-all">
                {sending ? 'Wird gesendet...' : 'Senden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
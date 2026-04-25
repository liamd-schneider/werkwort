'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Projekt {
  id: string; name: string; kunde_name: string; kunde_adresse: string | null
  beschreibung: string | null; status: string; created_at: string
}
interface Dok {
  id: string; typ: string; nummer: string; kunde_name: string
  brutto: number; status: string; created_at: string
}
interface Eintrag {
  id: string; baustelle: string; datum: string; ausgefuehrte_arbeiten: string
  arbeiter: number; wetter: string | null; lieferungen: string | null
  besuche: string | null; besonderheiten: string | null; fotos: string[] | null
  finalisiert: boolean; version: number; finalisiert_am: string | null
}

const TYP_COLORS: Record<string, string> = {
  angebot:     'bg-[#d4e840]/15 text-[#d4e840]',
  rechnung:    'bg-[#00D4AA]/15 text-[#00D4AA]',
  bauvertrag:  'bg-blue-500/15 text-blue-400',
  bautagebuch: 'bg-teal-500/15 text-teal-400',
}

const STATUS_COLORS: Record<string, string> = {
  aktiv:         'bg-[#00D4AA]/15 text-[#00D4AA] border border-[#00D4AA]/20',
  abgeschlossen: 'bg-[#2a2a2a] text-[#aaa] border border-[#333]',
  pausiert:      'bg-[#d4e840]/15 text-[#d4e840] border border-[#d4e840]/20',
}

export default function ProjektDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [dokumente, setDokumente] = useState<Dok[]>([])
  const [eintraege, setEintraege] = useState<Eintrag[]>([])
  const [loading, setLoading] = useState(true)
  const [dokDialog, setDokDialog] = useState(false)
  const [alleDoks, setAlleDoks] = useState<Dok[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [zeigeAlle, setZeigeAlle] = useState(false)

  useEffect(() => { loadProjekt() }, [])

  const loadProjekt = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const [projRes, dokRes, tagRes] = await Promise.all([
      (supabase as any).from('projekte').select('*').eq('id', params.id).eq('user_id', user.id).single(),
      (supabase as any).from('dokumente').select('*').eq('projekt_id', params.id).order('created_at', { ascending: false }),
      (supabase as any).from('bautagebuch').select('*').eq('projekt_id', params.id).order('datum', { ascending: false }),
    ])

    setProjekt(projRes.data)
    setDokumente(dokRes.data || [])
    setEintraege(tagRes.data || [])
    setLoading(false)
  }

  const dokHinzufuegen = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await (supabase as any).from('dokumente').select('id,typ,nummer,kunde_name,brutto,status,created_at')
      .eq('user_id', user.id).is('projekt_id', null).order('created_at', { ascending: false })
    setAlleDoks(data || [])
    setDokDialog(true)
  }

  const dokZuweisen = async (dokId: string) => {
    await (supabase as any).from('dokumente').update({ projekt_id: params.id }).eq('id', dokId)
    setDokDialog(false)
    loadProjekt()
  }

  const statusAendern = async (status: string) => {
    await (supabase as any).from('projekte').update({ status }).eq('id', params.id)
    if (projekt) setProjekt({ ...projekt, status })
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>
  if (!projekt) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center text-[#888]">Projekt nicht gefunden</div>

  const gesamtbetrag = dokumente.reduce((s, d) => s + (d.brutto || 0), 0)
  const sichtbareEintraege = zeigeAlle ? eintraege : eintraege.slice(0, 5)

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* ── Top Bar – zweizeilig auf Handy ── */}
      <div className="border-b border-[#1a1a1a] px-4 sm:px-6 py-3">
        {/* Zeile 1: Zurück + Titel */}
        <div className="flex items-center gap-3 min-w-0 mb-1 sm:mb-0">
          <Link href="/projekte" className="text-[#888] hover:text-[#bbb] flex-shrink-0 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            {/* Titel vollständig anzeigen — kein truncate */}
            <h1 className="text-base sm:text-lg font-medium leading-tight">{projekt.name}</h1>
            <p className="text-xs text-[#888]">{projekt.kunde_name}</p>
          </div>
          {/* Betrag + Status auf Desktop rechts neben Titel */}
          <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
            {gesamtbetrag > 0 && (
              <span className="text-sm font-medium text-[#d4e840] tabular-nums">
                {gesamtbetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
              </span>
            )}
            <select value={projekt.status} onChange={e => statusAendern(e.target.value)}
              className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-3 py-1.5 text-xs text-[#f0ede8] focus:outline-none focus:border-[#d4e840]">
              <option value="aktiv">Aktiv</option>
              <option value="pausiert">Pausiert</option>
              <option value="abgeschlossen">Abgeschlossen</option>
            </select>
          </div>
        </div>

        {/* Zeile 2: Betrag + Status auf Handy */}
        <div className="flex items-center gap-2 sm:hidden mt-1 pl-8">
          <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[projekt.status]}`}>
            {projekt.status.charAt(0).toUpperCase() + projekt.status.slice(1)}
          </span>
          {gesamtbetrag > 0 && (
            <span className="text-xs font-medium text-[#d4e840] tabular-nums ml-auto">
              {gesamtbetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
            </span>
          )}
          <select value={projekt.status} onChange={e => statusAendern(e.target.value)}
            className="bg-[#181818] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs text-[#f0ede8] focus:outline-none focus:border-[#d4e840]">
            <option value="aktiv">Aktiv</option>
            <option value="pausiert">Pausiert</option>
            <option value="abgeschlossen">Abgeschlossen</option>
          </select>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {projekt.beschreibung && (
          <p className="text-sm text-[#888] mb-8">{projekt.beschreibung}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Dokumente + Bautagebuch */}
          <div className="lg:col-span-2 space-y-6">

            {/* Dokumente */}
            <div>
              {/* Header: Label + Buttons */}
              <div className="mb-3">
                <p className="text-xs text-[#888] uppercase tracking-widest mb-2">Dokumente</p>
                {/* Buttons: auf Handy volle Breite untereinander, auf Desktop nebeneinander */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <button type="button" onClick={dokHinzufuegen}
                    className="text-xs text-[#aaa] hover:text-[#f0ede8] border border-[#2a2a2a] hover:border-[#444] px-3 py-2 sm:py-1.5 rounded-lg transition-all text-center">
                    Bestehendes hinzufügen
                  </button>
                  <Link href="/neu"
                    className="text-xs bg-[#d4e840] text-black px-3 py-2 sm:py-1.5 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                    Neu erstellen
                  </Link>
                </div>
              </div>

              {dokumente.length === 0 ? (
                <div className="border border-dashed border-[#2a2a2a] rounded-xl p-8 text-center">
                  <p className="text-[#888] text-sm mb-2">Noch keine Dokumente in diesem Projekt</p>
                  <Link href="/neu" className="text-[#d4e840] text-xs hover:opacity-75">Dokument erstellen →</Link>
                </div>
              ) : (
                <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
                  {dokumente.map((d, i) => (
                    <Link key={d.id} href={`/dokumente/${d.id}`}
                      className={`flex items-center gap-3 px-5 py-4 hover:bg-[#1f1f1f] transition-colors ${i !== dokumente.length - 1 ? 'border-b border-[#1f1f1f]' : ''}`}>
                      <span className={`text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${TYP_COLORS[d.typ] || 'bg-[#2a2a2a] text-[#aaa]'}`}>
                        {d.typ.slice(0,1).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-[#f0ede8]">{d.kunde_name}</p>
                        <p className="text-xs text-[#888]">{d.nummer} · {new Date(d.created_at).toLocaleDateString('de-DE')}</p>
                      </div>
                      <p className="text-sm font-medium tabular-nums flex-shrink-0 text-[#f0ede8]">
                        {d.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Bautagebuch */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#888] uppercase tracking-widest">
                  Bautagebuch
                  {eintraege.length > 0 && <span className="ml-2 text-[#555]">({eintraege.length})</span>}
                </p>
                <Link href="/bautagebuch"
                  className="text-xs bg-[#d4e840] text-black px-3 py-1.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                  Neuer Eintrag
                </Link>
              </div>

              {eintraege.length === 0 ? (
                <div className="border border-dashed border-[#2a2a2a] rounded-xl p-8 text-center">
                  <p className="text-[#888] text-sm">Noch keine Bautagebuch-Einträge</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sichtbareEintraege.map(e => {
                    const isExpanded = expandedIds.has(e.id)

                    return (
                      <div key={e.id}
                        className={`bg-[#181818] border rounded-xl overflow-hidden transition-all ${e.finalisiert ? 'border-[#00D4AA]/20' : 'border-[#2a2a2a]'}`}>

                        {/* Klickbarer Header */}
                        <button
                          type="button"
                          onClick={() => toggleExpand(e.id)}
                          className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-[#1f1f1f] transition-colors">

                          <svg
                            className={`w-4 h-4 text-[#555] flex-shrink-0 mt-0.5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <p className="text-sm font-medium text-[#f0ede8]">
                                {new Date(e.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                              </p>
                              <div className="flex items-center gap-3 flex-shrink-0">
                                {e.finalisiert && (
                                  <span className="text-xs text-[#00D4AA]/70 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                                    </svg>
                                    V{e.version}
                                  </span>
                                )}
                                {e.wetter && <span className="text-xs text-[#888]">{e.wetter}</span>}
                                <span className="text-xs text-[#888] flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z"/>
                                  </svg>
                                  {e.arbeiter}
                                </span>
                              </div>
                            </div>
                            <p className={`text-sm text-[#aaa] ${isExpanded ? '' : 'line-clamp-2'}`}>
                              {e.ausgefuehrte_arbeiten}
                            </p>
                          </div>
                        </button>

                        {/* Ausgeklappter Inhalt */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-[#1f1f1f] space-y-3 ml-7">

                            {e.baustelle && (
                              <p className="text-xs text-[#888]">
                                <span className="text-[#666]">Baustelle: </span>{e.baustelle}
                              </p>
                            )}

                            {e.lieferungen && (
                              <div className="flex gap-2">
                                <svg className="w-3.5 h-3.5 text-[#555] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <div>
                                  <p className="text-xs text-[#666] mb-0.5">Lieferungen</p>
                                  <p className="text-sm text-[#aaa]">{e.lieferungen}</p>
                                </div>
                              </div>
                            )}

                            {e.besuche && (
                              <div className="flex gap-2">
                                <svg className="w-3.5 h-3.5 text-[#555] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round"/>
                                </svg>
                                <div>
                                  <p className="text-xs text-[#666] mb-0.5">Besuche</p>
                                  <p className="text-sm text-[#aaa]">{e.besuche}</p>
                                </div>
                              </div>
                            )}

                            {e.besonderheiten && (
                              <div className="bg-[#d4e840]/5 border border-[#d4e840]/15 rounded-xl p-3">
                                <p className="text-xs text-[#d4e840] mb-1 flex items-center gap-1.5">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round"/>
                                  </svg>
                                  Besonderheit
                                </p>
                                <p className="text-sm text-[#ddd]">{e.besonderheiten}</p>
                              </div>
                            )}

                            {e.fotos && e.fotos.length > 0 && (
                              <div>
                                <p className="text-xs text-[#666] mb-2">Fotos ({e.fotos.length})</p>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {e.fotos.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                      <img src={url} alt="" className="w-full h-20 object-cover rounded-lg hover:opacity-80 transition-opacity"/>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {e.finalisiert && e.finalisiert_am && (
                              <div className="flex items-center gap-2 pt-1">
                                <svg className="w-3 h-3 text-[#00D4AA]/40 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round"/>
                                </svg>
                                <p className="text-xs text-[#555]">
                                  GoBD-versiegelt {new Date(e.finalisiert_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            )}

                            <Link href="/bautagebuch"
                              className="inline-flex items-center gap-1 text-xs text-[#888] hover:text-[#d4e840] transition-colors pt-1">
                              Im Bautagebuch öffnen
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round"/>
                              </svg>
                            </Link>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {eintraege.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setZeigeAlle(!zeigeAlle)}
                      className="w-full text-center text-xs text-[#888] hover:text-[#bbb] py-2 transition-colors flex items-center justify-center gap-1.5">
                      {zeigeAlle
                        ? <>Weniger anzeigen <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M5 15l7-7 7 7" strokeLinecap="round"/></svg></>
                        : <>Alle {eintraege.length} Einträge anzeigen <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round"/></svg></>
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info Sidebar */}
          <div className="space-y-4">
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="text-xs text-[#888] uppercase tracking-widest mb-4">Projektinfo</p>
              <div className="space-y-3 text-sm">
                {[
                  ['Kunde', projekt.kunde_name],
                  ['Adresse', projekt.kunde_adresse || '—'],
                  ['Erstellt', new Date(projekt.created_at).toLocaleDateString('de-DE')],
                  ['Dokumente', String(dokumente.length)],
                  ['Tagebuch', `${eintraege.length} Einträge`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[#888]">{k}</span>
                    <span className="text-right ml-4 truncate text-[#f0ede8]">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center">
                  <span className="text-[#888]">Status</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[projekt.status]}`}>
                    {projekt.status.charAt(0).toUpperCase() + projekt.status.slice(1)}
                  </span>
                </div>
                {gesamtbetrag > 0 && (
                  <div className="flex justify-between pt-2 border-t border-[#2a2a2a]">
                    <span className="text-[#888]">Gesamtbetrag</span>
                    <span className="text-[#d4e840] font-medium tabular-nums">
                      {gesamtbetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dokument zuweisen Dialog */}
      {dokDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50" onClick={e => e.target === e.currentTarget && setDokDialog(false)}>
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-medium mb-4">Dokument hinzufügen</h2>
            <div className="overflow-y-auto flex-1 space-y-2">
              {alleDoks.length === 0 ? (
                <p className="text-[#888] text-sm text-center py-8">Alle Dokumente sind bereits Projekten zugeordnet</p>
              ) : alleDoks.map(d => (
                <button key={d.id} type="button" onClick={() => dokZuweisen(d.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#444] transition-all text-left">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${TYP_COLORS[d.typ] || 'bg-[#2a2a2a] text-[#aaa]'}`}>
                    {d.typ.slice(0,1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-[#f0ede8]">{d.kunde_name}</p>
                    <p className="text-xs text-[#888]">{d.nummer}</p>
                  </div>
                  <p className="text-sm tabular-nums text-[#aaa]">{d.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDokDialog(false)}
              className="mt-4 w-full py-3 rounded-xl border border-[#2a2a2a] text-sm text-[#aaa] hover:text-[#f0ede8] transition-all">
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
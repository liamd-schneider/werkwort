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
  arbeiter: number; wetter: string | null
}

const TYP_COLORS: Record<string, string> = {
  angebot: 'bg-[#d4e840]/15 text-[#d4e840]',
  rechnung: 'bg-green-500/15 text-green-400',
  bauvertrag: 'bg-blue-500/15 text-blue-400',
  bautagebuch: 'bg-teal-500/15 text-teal-400',
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

  if (loading) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>
  if (!projekt) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center text-[#555]">Projekt nicht gefunden</div>

  const gesamtbetrag = dokumente.reduce((s, d) => s + (d.brutto || 0), 0)

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/projekte" className="text-[#555] hover:text-[#888] flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-medium truncate">{projekt.name}</h1>
            <p className="text-xs text-[#555]">{projekt.kunde_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        {projekt.beschreibung && (
          <p className="text-sm text-[#555] mb-8">{projekt.beschreibung}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Dokumente */}
          <div className="lg:col-span-2 space-y-6">

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#444] uppercase tracking-widest">Dokumente</p>
                <div className="flex gap-2">
                  <button type="button" onClick={dokHinzufuegen}
                    className="text-xs text-[#555] hover:text-[#888] border border-[#2a2a2a] px-3 py-1.5 rounded-lg transition-all">
                    Bestehendes hinzufügen
                  </button>
                  <Link href={`/neu`}
                    className="text-xs bg-[#d4e840] text-black px-3 py-1.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                    Neu erstellen
                  </Link>
                </div>
              </div>

              {dokumente.length === 0 ? (
                <div className="border border-dashed border-[#2a2a2a] rounded-xl p-8 text-center">
                  <p className="text-[#444] text-sm mb-2">Noch keine Dokumente in diesem Projekt</p>
                  <Link href="/neu" className="text-[#d4e840] text-xs hover:opacity-75">Dokument erstellen →</Link>
                </div>
              ) : (
                <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
                  {dokumente.map((d, i) => (
                    <Link key={d.id} href={`/dokumente/${d.id}`}
                      className={`flex items-center gap-3 px-5 py-4 hover:bg-[#1f1f1f] transition-colors ${i !== dokumente.length - 1 ? 'border-b border-[#1f1f1f]' : ''}`}>
                      <span className={`text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${TYP_COLORS[d.typ]}`}>
                        {d.typ.slice(0,1).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.kunde_name}</p>
                        <p className="text-xs text-[#555]">{d.nummer} · {new Date(d.created_at).toLocaleDateString('de-DE')}</p>
                      </div>
                      <p className="text-sm font-medium tabular-nums flex-shrink-0">
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
                <p className="text-xs text-[#444] uppercase tracking-widest">Bautagebuch</p>
                <Link href="/bautagebuch"
                  className="text-xs bg-[#d4e840] text-black px-3 py-1.5 rounded-lg hover:opacity-90 transition-all flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
                  Neuer Eintrag
                </Link>
              </div>

              {eintraege.length === 0 ? (
                <div className="border border-dashed border-[#2a2a2a] rounded-xl p-8 text-center">
                  <p className="text-[#444] text-sm">Noch keine Bautagebuch-Einträge</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eintraege.slice(0, 5).map(e => (
                    <div key={e.id} className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">
                          {new Date(e.datum).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-[#555]">
                          {e.wetter && <span>{e.wetter}</span>}
                          <span>{e.arbeiter} Arbeiter</span>
                        </div>
                      </div>
                      <p className="text-sm text-[#888] line-clamp-2">{e.ausgefuehrte_arbeiten}</p>
                    </div>
                  ))}
                  {eintraege.length > 5 && (
                    <Link href="/bautagebuch" className="block text-center text-xs text-[#555] hover:text-[#888] py-2">
                      Alle {eintraege.length} Einträge anzeigen →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="space-y-4">
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Projektinfo</p>
              <div className="space-y-3 text-sm">
                {[
                  ['Kunde', projekt.kunde_name],
                  ['Adresse', projekt.kunde_adresse || '—'],
                  ['Status', projekt.status.charAt(0).toUpperCase() + projekt.status.slice(1)],
                  ['Erstellt', new Date(projekt.created_at).toLocaleDateString('de-DE')],
                  ['Dokumente', String(dokumente.length)],
                  ['Tagebuch', `${eintraege.length} Einträge`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[#555]">{k}</span>
                    <span className="text-right ml-4 truncate">{v}</span>
                  </div>
                ))}
                {gesamtbetrag > 0 && (
                  <div className="flex justify-between pt-2 border-t border-[#2a2a2a]">
                    <span className="text-[#555]">Gesamtbetrag</span>
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
                <p className="text-[#555] text-sm text-center py-8">Alle Dokumente sind bereits Projekten zugeordnet</p>
              ) : alleDoks.map(d => (
                <button key={d.id} type="button" onClick={() => dokZuweisen(d.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#444] transition-all text-left">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 ${TYP_COLORS[d.typ]}`}>
                    {d.typ.slice(0,1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.kunde_name}</p>
                    <p className="text-xs text-[#555]">{d.nummer}</p>
                  </div>
                  <p className="text-sm tabular-nums text-[#888]">{d.brutto.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</p>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setDokDialog(false)}
              className="mt-4 w-full py-3 rounded-xl border border-[#2a2a2a] text-sm text-[#888] hover:text-[#f0ede8] transition-all">
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
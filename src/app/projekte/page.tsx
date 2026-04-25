'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Projekt {
  id: string
  name: string
  kunde_name: string
  kunde_adresse: string | null
  beschreibung: string | null
  status: 'aktiv' | 'abgeschlossen' | 'pausiert'
  created_at: string
  dokument_count?: number
  tagebuch_count?: number
  gesamtbetrag?: number
}

const STATUS_COLORS = {
  aktiv:         'bg-[#00D4AA]/15 text-[#00D4AA] border border-[#00D4AA]/20',
  abgeschlossen: 'bg-[#2a2a2a] text-[#aaa] border border-[#333]',
  pausiert:      'bg-[#d4e840]/15 text-[#d4e840] border border-[#d4e840]/20',
}

export default function ProjektePage() {
  const router = useRouter()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [loading, setLoading] = useState(true)
  const [neuDialog, setNeuDialog] = useState(false)
  const [form, setForm] = useState({ name: '', kunde_name: '', kunde_adresse: '', beschreibung: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadProjekte() }, [])

  const loadProjekte = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const { data } = await (supabase as any)
      .from('projekte').select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const enriched = await Promise.all((data || []).map(async (p: Projekt) => {
      const [dokRes, tagRes] = await Promise.all([
        (supabase as any).from('dokumente').select('brutto', { count: 'exact' }).eq('projekt_id', p.id),
        (supabase as any).from('bautagebuch').select('id', { count: 'exact' }).eq('projekt_id', p.id),
      ])
      const gesamtbetrag = (dokRes.data || []).reduce((s: number, d: any) => s + (d.brutto || 0), 0)
      return { ...p, dokument_count: dokRes.count || 0, tagebuch_count: tagRes.count || 0, gesamtbetrag }
    }))

    setProjekte(enriched)
    setLoading(false)
  }

  const projektErstellen = async () => {
    if (!form.name || !form.kunde_name) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await (supabase as any).from('projekte').insert({
      user_id:        user.id,
      name:           form.name,
      kunde_name:     form.kunde_name,
      kunde_adresse:  form.kunde_adresse || null,
      beschreibung:   form.beschreibung || null,
    }).select().single()

    if (data) {
      setNeuDialog(false)
      setForm({ name: '', kunde_name: '', kunde_adresse: '', beschreibung: '' })
      router.push(`/projekte/${data.id}`)
    }
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Projekte</h1>
        <button type="button" onClick={() => setNeuDialog(true)}
          className="bg-[#d4e840] text-black text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
          Neues Projekt
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>
        ) : projekte.length === 0 ? (
          <div className="border border-dashed border-[#2a2a2a] rounded-2xl p-16 text-center">
            <p className="text-[#888] mb-3">Noch keine Projekte</p>
            <button type="button" onClick={() => setNeuDialog(true)} className="text-[#d4e840] text-sm hover:opacity-75">
              Erstes Projekt erstellen →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projekte.map(p => (
              <Link key={p.id} href={`/projekte/${p.id}`}
                className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-5 hover:border-[#444] transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate text-[#f0ede8]">{p.name}</p>
                    <p className="text-sm text-[#888] mt-0.5 truncate">{p.kunde_name}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ml-2 flex-shrink-0 ${STATUS_COLORS[p.status]}`}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </span>
                </div>
                {p.beschreibung && (
                  <p className="text-xs text-[#888] mb-4 line-clamp-2">{p.beschreibung}</p>
                )}
                <div className="flex items-center justify-between text-xs text-[#888] pt-3 border-t border-[#2a2a2a]">
                  <div className="flex items-center gap-3">
                    <span>{p.dokument_count} Dokumente</span>
                    <span>{p.tagebuch_count} Einträge</span>
                  </div>
                  {(p.gesamtbetrag || 0) > 0 && (
                    <span className="text-[#d4e840] font-medium tabular-nums">
                      {(p.gesamtbetrag || 0).toLocaleString('de-DE', { minimumFractionDigits: 0 })} €
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Dialog */}
      {neuDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-6 z-50" onClick={e => e.target === e.currentTarget && setNeuDialog(false)}>
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-medium mb-5">Neues Projekt</h2>
            <div className="space-y-4">
              {[
                { label: 'Projektname *', key: 'name', placeholder: 'z.B. Badsanierung Müller' },
                { label: 'Kunde *', key: 'kunde_name', placeholder: 'Familie Müller' },
                { label: 'Adresse', key: 'kunde_adresse', placeholder: 'Gartenstraße 12, 65549 Limburg' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-[#888] mb-1.5 block">{f.label}</label>
                  <input type="text" value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder} required={f.label.endsWith('*')}
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                </div>
              ))}
              <div>
                <label className="text-xs text-[#888] mb-1.5 block">Beschreibung</label>
                <textarea value={form.beschreibung} onChange={e => setForm({ ...form, beschreibung: e.target.value })}
                  placeholder="Kurze Beschreibung des Projekts..." rows={2}
                  className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#555] focus:outline-none focus:border-[#d4e840] resize-none transition-colors"/>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setNeuDialog(false)}
                className="flex-1 py-3 rounded-xl border border-[#2a2a2a] text-sm text-[#aaa] hover:text-[#f0ede8] hover:border-[#444] transition-all">
                Abbrechen
              </button>
              <button type="button" onClick={projektErstellen} disabled={saving || !form.name || !form.kunde_name}
                className="flex-1 py-3 rounded-xl bg-[#d4e840] text-black font-medium text-sm hover:opacity-90 disabled:opacity-40 transition-all">
                {saving ? 'Erstellen...' : 'Projekt erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
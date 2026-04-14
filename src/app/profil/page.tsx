'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Betrieb {
  id: string; name: string; adresse: string; telefon: string | null
  email: string | null; steuernummer: string | null; iban: string | null
  logo_url: string | null; farbe_primary: string | null; farbe_accent: string | null
  schriftart: string | null; formular_stil: string | null
  fusszeile: string | null; website: string | null
}

interface Preisposition { id: string; beschreibung: string; einheit: string; preis: number }

const PAKETE = [
  { id: 'starter', name: 'Starter', token: 25,  preis: 9,  priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || '' },
  { id: 'pro',     name: 'Pro',     token: 100, preis: 29, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO     || '', beliebt: true },
  { id: 'team',    name: 'Team',    token: 300, preis: 59, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM    || '' },
]

const STILE = [
  { id: 'modern',    label: 'Modern',    desc: 'Sauber, minimalistisch' },
  { id: 'klassisch', label: 'Klassisch', desc: 'Traditionell, seriös' },
  { id: 'bold',      label: 'Bold',      desc: 'Kräftig, auffällig' },
]

function ProfilPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [betrieb, setBetrieb]           = useState<Betrieb | null>(null)
  const [preise, setPreise]             = useState<Preisposition[]>([])
  const [tokenGuthaben, setToken]       = useState(0)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [tokenLoading, setTokenLoading] = useState<string | null>(null)
  const [logoUploading, setLogoUp]      = useState(false)
  const [successMsg, setSuccessMsg]     = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState<'betrieb'|'formular'|'preise'|'token'>('betrieb')
  const [neuePreis, setNeuePreis]       = useState({ beschreibung: '', einheit: 'm²', preis: '' })
  const logoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfil()
    if (searchParams.get('success') === '1') {
      const t = searchParams.get('token')
      setSuccessMsg(`✓ Zahlung erfolgreich! ${t} Token wurden gutgeschrieben.`)
      setActiveTab('token')
      setTimeout(() => setSuccessMsg(null), 6000)
    }
    if (searchParams.get('canceled') === '1') {
      setSuccessMsg('Zahlung abgebrochen.')
      setTimeout(() => setSuccessMsg(null), 3000)
    }
  }, [])

  const loadProfil = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const [betriebRes, preiseRes, tokenRes] = await Promise.all([
      (supabase as any).from('betriebe').select('*').eq('user_id', user.id).single(),
      (supabase as any).from('preispositionen').select('*').eq('user_id', user.id).order('created_at'),
      (supabase as any).from('token_konten').select('guthaben').eq('user_id', user.id).single(),
    ])

    setBetrieb(betriebRes.data)
    setPreise(preiseRes.data || [])
    setToken(tokenRes.data?.guthaben || 0)
    setLoading(false)
  }

  const speichern = async () => {
    if (!betrieb) return
    setSaving(true)
    await (supabase as any).from('betriebe').update({
      name: betrieb.name, adresse: betrieb.adresse, telefon: betrieb.telefon,
      email: betrieb.email, steuernummer: betrieb.steuernummer, iban: betrieb.iban,
      farbe_primary: betrieb.farbe_primary, farbe_accent: betrieb.farbe_accent,
      schriftart: betrieb.schriftart, formular_stil: betrieb.formular_stil,
      fusszeile: betrieb.fusszeile, website: betrieb.website,
    }).eq('id', betrieb.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const logoHochladen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !betrieb) return
    setLogoUp(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const ext  = file.name.split('.').pop()
    const path = `${user.id}/logo.${ext}`
    await supabase.storage.from('logos').remove([path])
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      await (supabase as any).from('betriebe').update({ logo_url: url }).eq('id', betrieb.id)
      setBetrieb({ ...betrieb, logo_url: url })
    }
    setLogoUp(false)
  }

  const logoLoeschen = async () => {
    if (!betrieb) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.storage.from('logos').remove([`${user.id}/logo.png`,`${user.id}/logo.jpg`,`${user.id}/logo.jpeg`])
    await (supabase as any).from('betriebe').update({ logo_url: null }).eq('id', betrieb.id)
    setBetrieb({ ...betrieb, logo_url: null })
  }

  // ─── Preisliste ────────────────────────────────────────────────
  const preisHinzufuegen = async () => {
    if (!neuePreis.beschreibung || !neuePreis.preis) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await (supabase as any).from('preispositionen').insert({
      user_id:      user.id,
      beschreibung: neuePreis.beschreibung,
      einheit:      neuePreis.einheit,
      preis:        parseFloat(neuePreis.preis),
    }).select().single()
    if (data) {
      setPreise([...preise, data])
      setNeuePreis({ beschreibung: '', einheit: 'm²', preis: '' })
    }
  }

  const preisLoeschen = async (id: string) => {
    await (supabase as any).from('preispositionen').delete().eq('id', id)
    setPreise(preise.filter(p => p.id !== id))
  }

  // ─── Token kaufen ──────────────────────────────────────────────
  const tokenKaufen = async (paket: typeof PAKETE[0]) => {
    setTokenLoading(paket.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ paketId: paket.id, priceId: paket.priceId }),
    })
    const result = await res.json()
    if (result.url) window.location.href = result.url
    else { alert(result.error || 'Fehler beim Checkout'); setTokenLoading(null) }
  }

  const set = (field: keyof Betrieb, value: string) => {
    if (!betrieb) return
    setBetrieb({ ...betrieb, [field]: value })
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Profil</h1>
        <button type="button" onClick={async () => { await supabase.auth.signOut(); router.push('/auth') }}
          className="text-sm text-[#444] hover:text-[#888] transition-colors">Ausloggen</button>
      </div>

      {successMsg && (
        <div className={`px-6 py-3 text-sm text-center border-b ${successMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-[#2a2a2a] text-[#888] border-[#333]'}`}>
          {successMsg}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* Tabs */}
        <div className="flex bg-[#181818] border border-[#2a2a2a] rounded-xl p-1 mb-8">
          {([
            { id: 'betrieb',  label: 'Betrieb' },
            { id: 'formular', label: 'Formulardesign' },
            { id: 'preise',   label: 'Preisliste' },
            { id: 'token',    label: `Token (${tokenGuthaben})` },
          ] as const).map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm rounded-lg transition-all ${activeTab === tab.id ? 'bg-[#2a2a2a] text-[#f0ede8] font-medium' : 'text-[#555] hover:text-[#888]'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── BETRIEB ─── */}
        {activeTab === 'betrieb' && betrieb && (
          <div className="space-y-6">
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Logo</p>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 bg-[#111] border border-[#2a2a2a] rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {betrieb.logo_url
                    ? <img src={betrieb.logo_url} alt="Logo" className="w-full h-full object-contain p-2"/>
                    : <span className="text-2xl font-bold text-[#333]">{betrieb.name.slice(0,2).toUpperCase()}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <input ref={logoInput} type="file" accept="image/*" onChange={logoHochladen} className="hidden"/>
                  <button type="button" onClick={() => logoInput.current?.click()} disabled={logoUploading}
                    className="px-4 py-2 bg-[#d4e840] text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40">
                    {logoUploading ? 'Lädt hoch...' : 'Logo hochladen'}
                  </button>
                  {betrieb.logo_url && (
                    <button type="button" onClick={logoLoeschen}
                      className="px-4 py-2 border border-red-500/30 text-red-500/70 text-sm rounded-lg hover:text-red-400 transition-all">
                      Logo entfernen
                    </button>
                  )}
                  <p className="text-xs text-[#444]">PNG, JPG — max. 2MB</p>
                </div>
              </div>
            </div>

            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-5">Betriebsdaten</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Betriebsname *', key: 'name',        placeholder: 'Bauer Fliesen GmbH' },
                  { label: 'Adresse',        key: 'adresse',     placeholder: 'Musterstraße 1, 65549 Limburg', full: true },
                  { label: 'Telefon',        key: 'telefon',     placeholder: '+49 6431 123456' },
                  { label: 'E-Mail',         key: 'email',       placeholder: 'info@bauer-fliesen.de' },
                  { label: 'Website',        key: 'website',     placeholder: 'www.bauer-fliesen.de' },
                  { label: 'Steuernummer',   key: 'steuernummer', placeholder: '123/456/78901' },
                  { label: 'IBAN',           key: 'iban',        placeholder: 'DE12 3456 7890 1234 5678 90', full: true },
                  { label: 'Fußzeile',       key: 'fusszeile',   placeholder: 'Mitglied der HWK · USt-IdNr: DE123456789', full: true },
                ].map(f => (
                  <div key={f.key} className={(f as any).full ? 'md:col-span-2' : ''}>
                    <label className="text-xs text-[#666] mb-1.5 block">{f.label}</label>
                    <input type="text" value={(betrieb as any)[f.key] || ''} onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                  </div>
                ))}
              </div>
              <button type="button" onClick={speichern} disabled={saving}
                className="mt-5 bg-[#d4e840] text-black font-medium px-6 py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Speichern'}
              </button>
            </div>
          </div>
        )}

        {/* ─── FORMULARDESIGN ─── */}
        {activeTab === 'formular' && betrieb && (
          <div className="space-y-6">
            {/* Vorschau */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#2a2a2a]">
                <p className="text-xs text-[#444] uppercase tracking-widest">Vorschau</p>
              </div>
              <div className="p-6">
                <div style={{
                  background: 'white', borderRadius: '8px', padding: '24px', border: '1px solid #eee',
                  fontFamily: betrieb.schriftart === 'georgia' ? 'Georgia,serif' : betrieb.schriftart === 'courier' ? 'monospace' : 'Arial,sans-serif',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'12px', paddingBottom:'10px', borderBottom:`2px solid ${betrieb.farbe_accent||'#d4e840'}` }}>
                    <div>
                      {betrieb.logo_url && <img src={betrieb.logo_url} style={{ height:'32px', marginBottom:'4px', objectFit:'contain' }} alt=""/>}
                      <p style={{ fontSize:'13px', fontWeight:700, color: betrieb.farbe_primary||'#0c0c0c' }}>{betrieb.name||'Dein Betrieb'}</p>
                      <p style={{ fontSize:'9px', color:'#888', marginTop:'2px' }}>{betrieb.adresse||'Adresse'}</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ fontSize:'15px', fontWeight:800, color: betrieb.farbe_accent||'#d4e840' }}>ANGEBOT</p>
                      <p style={{ fontSize:'9px', color:'#999' }}>Nr. 2026-A-001</p>
                    </div>
                  </div>
                  <div style={{ background:(betrieb.farbe_accent||'#d4e840')+'20', borderLeft:`3px solid ${betrieb.farbe_accent||'#d4e840'}`, padding:'6px 10px', fontSize:'10px', color:'#333' }}>
                    Mustermann GmbH · Musterstraße 1 · 12345 Stadt
                  </div>
                </div>
              </div>
            </div>

            {/* Farben */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-5">Farben</p>
              <div className="grid grid-cols-2 gap-6 mb-4">
                {[
                  { label: 'Primärfarbe', key: 'farbe_primary', def: '#0c0c0c' },
                  { label: 'Akzentfarbe', key: 'farbe_accent',  def: '#d4e840' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-[#666] mb-2 block">{f.label}</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={(betrieb as any)[f.key]||f.def} onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                        className="w-12 h-10 rounded-lg border border-[#2a2a2a] cursor-pointer bg-transparent"/>
                      <input type="text" value={(betrieb as any)[f.key]||f.def} onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                        className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0ede8] font-mono focus:outline-none focus:border-[#d4e840]"/>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[['#0c0c0c','#d4e840','Standard'],['#1a3a5c','#e85d24','Klassisch'],['#1a1a1a','#1d9e75','Grün'],['#2c3e50','#3498db','Blau'],['#1a1a1a','#e74c3c','Rot'],['#2d1a4a','#9b59b6','Lila']].map(([p,a,l]) => (
                  <button key={l} type="button" onClick={() => { set('farbe_primary',p); set('farbe_accent',a) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-xs text-[#888] hover:border-[#444] transition-all">
                    <span style={{ background:p, width:10, height:10, borderRadius:'50%', display:'inline-block' }}/>
                    <span style={{ background:a, width:10, height:10, borderRadius:'50%', display:'inline-block' }}/>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Schrift + Stil */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Schriftart</p>
                <div className="grid grid-cols-2 gap-2">
                  {[['helvetica','Helvetica'],['georgia','Georgia'],['arial','Arial'],['courier','Courier']].map(([id,label]) => (
                    <button key={id} type="button" onClick={() => set('schriftart', id)}
                      className={`p-3 rounded-xl border text-center transition-all ${betrieb.schriftart===id ? 'border-[#d4e840] bg-[#d4e840]/10' : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'}`}>
                      <p style={{ fontFamily: id==='georgia'?'Georgia,serif':id==='courier'?'monospace':'Arial,sans-serif', fontSize:'20px' }}>Aa</p>
                      <p className="text-xs text-[#555] mt-1">{label}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Dokumentstil</p>
                <div className="space-y-2">
                  {STILE.map(s => (
                    <button key={s.id} type="button" onClick={() => set('formular_stil', s.id)}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${betrieb.formular_stil===s.id ? 'border-[#d4e840] bg-[#d4e840]/10' : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'}`}>
                      <p className="font-medium text-sm">{s.label}</p>
                      <p className="text-xs text-[#555] mt-0.5">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="button" onClick={speichern} disabled={saving}
              className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
              {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Design speichern'}
            </button>
          </div>
        )}

        {/* ─── PREISLISTE ─── */}
        {activeTab === 'preise' && (
          <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
            <p className="text-xs text-[#444] uppercase tracking-widest mb-1">Meine Preisliste</p>
            <p className="text-xs text-[#555] mb-5 leading-relaxed">
              Die KI übernimmt diese Preise automatisch bei der Dokumenterstellung — du musst sie nicht jedes Mal neu eingeben.
            </p>

            {/* Bestehende Preise */}
            {preise.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-[#2a2a2a] rounded-xl mb-5">
                <p className="text-sm text-[#444]">Noch keine Preise hinterlegt</p>
                <p className="text-xs text-[#333] mt-1">Trage unten deine Standardpreise ein</p>
              </div>
            ) : (
              <div className="space-y-2 mb-5">
                {preise.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-[#111] rounded-xl px-4 py-3 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.beschreibung}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-sm text-[#d4e840] tabular-nums font-medium">
                        {p.preis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/{p.einheit}
                      </span>
                      <button type="button" onClick={() => preisLoeschen(p.id)}
                        className="text-[#333] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Neue Position hinzufügen */}
            <div className="border-t border-[#2a2a2a] pt-5">
              <p className="text-xs text-[#444] mb-3">Neue Position</p>
              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={neuePreis.beschreibung}
                  onChange={e => setNeuePreis({ ...neuePreis, beschreibung: e.target.value })}
                  placeholder="z.B. Fliesenlegen"
                  className="col-span-5 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                <input
                  type="number"
                  value={neuePreis.preis}
                  onChange={e => setNeuePreis({ ...neuePreis, preis: e.target.value })}
                  placeholder="Preis €"
                  className="col-span-3 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                <select
                  value={neuePreis.einheit}
                  onChange={e => setNeuePreis({ ...neuePreis, einheit: e.target.value })}
                  className="col-span-2 bg-[#111] border border-[#2a2a2a] rounded-xl px-2 py-2.5 text-sm text-[#f0ede8] focus:outline-none focus:border-[#d4e840] transition-colors">
                  {['m²','Stk.','Std.','m','pauschal'].map(e => <option key={e}>{e}</option>)}
                </select>
                <button
                  type="button"
                  onClick={preisHinzufuegen}
                  disabled={!neuePreis.beschreibung || !neuePreis.preis}
                  className="col-span-2 bg-[#d4e840] text-black rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-all">
                  +
                </button>
              </div>
              <p className="text-xs text-[#333] mt-2">
                Beispiele: Fliesenlegen 45 €/m², Arbeitsstunde 65 €/Std., Materialaufschlag pauschal
              </p>
            </div>
          </div>
        )}

        {/* ─── TOKEN ─── */}
        {activeTab === 'token' && (
          <div className="space-y-6">
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#444] uppercase tracking-widest">Guthaben</p>
                <span className="text-3xl font-semibold text-[#d4e840] tabular-nums">{tokenGuthaben} Token</span>
              </div>
              <div className="bg-[#111] rounded-full h-2 overflow-hidden">
                <div className="h-full bg-[#d4e840] rounded-full" style={{ width:`${Math.min((tokenGuthaben/100)*100,100)}%` }}/>
              </div>
              <p className="text-xs text-[#444] mt-2">
                ~{Math.floor(tokenGuthaben/1.5)} Dokumente verbleibend &nbsp;·&nbsp;
                <span className="text-[#333]">Angebot = 2 · Rechnung = 1 · Bautagebuch = 1</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PAKETE.map(paket => (
                <div key={paket.id} className={`bg-[#181818] rounded-2xl p-6 flex flex-col ${paket.beliebt ? 'border-2 border-[#d4e840]' : 'border border-[#2a2a2a]'}`}>
                  {paket.beliebt && <span className="text-xs bg-[#d4e840]/20 text-[#d4e840] px-3 py-1 rounded-full self-start mb-4 font-medium">Beliebt</span>}
                  <p className="text-lg font-semibold">{paket.name}</p>
                  <p className="text-4xl font-bold mt-2 tabular-nums">{paket.token}</p>
                  <p className="text-sm text-[#555] mb-1">Token</p>
                  <p className="text-xl font-medium text-[#d4e840] mb-4">{paket.preis} €</p>
                  <p className="text-xs text-[#444] mb-5 flex-1">~{Math.floor(paket.token/1.5)} Dokumente</p>
                  <button type="button" onClick={() => tokenKaufen(paket)} disabled={tokenLoading === paket.id}
                    className={`w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-40 ${paket.beliebt ? 'bg-[#d4e840] text-black hover:opacity-90' : 'bg-[#2a2a2a] text-[#f0ede8] hover:bg-[#333]'}`}>
                    {tokenLoading === paket.id
                      ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Laden...</span>
                      : `${paket.preis} € kaufen`}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#333] text-center">Sicher über Stripe · Einmalig · Token verfallen nicht</p>
          </div>
        )}
      </div>
      <div className="h-24 md:h-8"/>
    </div>
  )
}

export default function ProfilPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0c0c0c]"/>}>
      <ProfilPageInner/>
    </Suspense>
  )
}
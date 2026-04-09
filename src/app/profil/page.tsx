'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Betrieb {
  id: string; name: string; adresse: string; telefon: string | null
  email: string | null; steuernummer: string | null; iban: string | null
  logo_url: string | null; farbe_primary: string | null; farbe_accent: string | null
  schriftart: string | null; formular_stil: string | null
  fusszeile: string | null; website: string | null
}

const PAKETE = [
  { id: 'starter', name: 'Starter',     token: 25,  preis: 9,  priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || '' },
  { id: 'pro',     name: 'Pro',         token: 100, preis: 29, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO     || '', beliebt: true },
  { id: 'team',    name: 'Team',        token: 300, preis: 59, priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM    || '' },
]

const SCHRIFTEN = ['helvetica', 'georgia', 'courier', 'arial']
const STILE = [
  { id: 'modern',    label: 'Modern',    desc: 'Sauber, minimalistisch' },
  { id: 'klassisch', label: 'Klassisch', desc: 'Traditionell, seriös' },
  { id: 'bold',      label: 'Bold',      desc: 'Kräftig, auffällig' },
]

export default function ProfilPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [betrieb, setBetrieb] = useState<Betrieb | null>(null)
  const [tokenGuthaben, setTokenGuthaben] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tokenLoading, setTokenLoading] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'betrieb' | 'formular' | 'token'>('betrieb')
  const [logoUploading, setLogoUploading] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const logoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfil()
    // Stripe Success/Cancel
    if (searchParams.get('success') === '1') {
      const token = searchParams.get('token')
      setSuccessMsg(`✓ Zahlung erfolgreich! ${token} Token wurden gutgeschrieben.`)
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

    const [betriebRes, tokenRes] = await Promise.all([
      (supabase as any).from('betriebe').select('*').eq('user_id', user.id).single(),
      (supabase as any).from('token_konten').select('guthaben').eq('user_id', user.id).single(),
    ])

    setBetrieb(betriebRes.data)
    setTokenGuthaben(tokenRes.data?.guthaben || 0)
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
    setLogoUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext  = file.name.split('.').pop()
    const path = `${user.id}/logo.${ext}`

    // Altes Logo löschen falls vorhanden
    await supabase.storage.from('logos').remove([path])

    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
      const logoUrl = `${publicUrl}?t=${Date.now()}`
      await (supabase as any).from('betriebe').update({ logo_url: logoUrl }).eq('id', betrieb.id)
      setBetrieb({ ...betrieb, logo_url: logoUrl })
    }
    setLogoUploading(false)
  }

  const logoLoeschen = async () => {
    if (!betrieb) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.storage.from('logos').remove([`${user.id}/logo.png`, `${user.id}/logo.jpg`, `${user.id}/logo.jpeg`])
    await (supabase as any).from('betriebe').update({ logo_url: null }).eq('id', betrieb.id)
    setBetrieb({ ...betrieb, logo_url: null })
  }

  const tokenKaufen = async (paket: typeof PAKETE[0]) => {
    setTokenLoading(paket.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ paketId: paket.id, priceId: paket.priceId }),
    })
    const result = await res.json()
    if (result.url) {
      window.location.href = result.url
    } else {
      alert(result.error || 'Fehler beim Checkout')
      setTokenLoading(null)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  if (loading) return <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/></div>

  const set = (field: keyof Betrieb, value: string) => {
    if (!betrieb) return
    setBetrieb({ ...betrieb, [field]: value })
  }

  const tabs = [
    { id: 'betrieb',  label: 'Betrieb' },
    { id: 'formular', label: 'Formulardesign' },
    { id: 'token',    label: `Token (${tokenGuthaben})` },
  ] as const

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Topbar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Profil</h1>
        <button type="button" onClick={handleLogout} className="text-sm text-[#444] hover:text-[#888] transition-colors">Ausloggen</button>
      </div>

      {/* Success / Error Banner */}
      {successMsg && (
        <div className={`px-6 py-3 text-sm text-center ${successMsg.startsWith('✓') ? 'bg-green-500/10 text-green-400 border-b border-green-500/20' : 'bg-[#2a2a2a] text-[#888] border-b border-[#333]'}`}>
          {successMsg}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* Tabs */}
        <div className="flex bg-[#181818] border border-[#2a2a2a] rounded-xl p-1 mb-8">
          {tabs.map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm rounded-lg transition-all ${activeTab === tab.id ? 'bg-[#2a2a2a] text-[#f0ede8] font-medium' : 'text-[#555] hover:text-[#888]'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── TAB: BETRIEB ─── */}
        {activeTab === 'betrieb' && betrieb && (
          <div className="space-y-6">

            {/* Logo */}
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
                    className="px-4 py-2 bg-[#d4e840] text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 transition-all">
                    {logoUploading ? 'Lädt hoch...' : 'Logo hochladen'}
                  </button>
                  {betrieb.logo_url && (
                    <button type="button" onClick={logoLoeschen}
                      className="px-4 py-2 border border-red-500/30 text-red-500/70 text-sm rounded-lg hover:text-red-400 hover:border-red-500/50 transition-all">
                      Logo entfernen
                    </button>
                  )}
                  <p className="text-xs text-[#444]">PNG, JPG — max. 2MB. Wird auf allen Dokumenten angezeigt.</p>
                </div>
              </div>
            </div>

            {/* Betriebsdaten */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-5">Betriebsdaten</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Betriebsname *', key: 'name',          placeholder: 'Bauer Fliesen GmbH' },
                  { label: 'Adresse',        key: 'adresse',       placeholder: 'Musterstraße 1, 65549 Limburg' },
                  { label: 'Telefon',        key: 'telefon',       placeholder: '+49 6431 123456' },
                  { label: 'E-Mail',         key: 'email',         placeholder: 'info@bauer-fliesen.de' },
                  { label: 'Website',        key: 'website',       placeholder: 'www.bauer-fliesen.de' },
                  { label: 'Steuernummer',   key: 'steuernummer',  placeholder: '123/456/78901' },
                  { label: 'IBAN',           key: 'iban',          placeholder: 'DE12 3456 7890 1234 5678 90' },
                ].map(f => (
                  <div key={f.key} className={f.key === 'adresse' || f.key === 'iban' ? 'md:col-span-2' : ''}>
                    <label className="text-xs text-[#666] mb-1.5 block">{f.label}</label>
                    <input type="text"
                      value={(betrieb as any)[f.key] || ''}
                      onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                  </div>
                ))}
                <div className="md:col-span-2">
                  <label className="text-xs text-[#666] mb-1.5 block">Fußzeile (erscheint auf Dokumenten)</label>
                  <input type="text"
                    value={betrieb.fusszeile || ''}
                    onChange={e => set('fusszeile', e.target.value)}
                    placeholder="z.B. Mitglied der Handwerkskammer Wiesbaden · USt-IdNr: DE123456789"
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] placeholder-[#444] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                </div>
              </div>
              <button type="button" onClick={speichern} disabled={saving}
                className="mt-5 bg-[#d4e840] text-black font-medium px-6 py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Speichern'}
              </button>
            </div>
          </div>
        )}

        {/* ─── TAB: FORMULARDESIGN ─── */}
        {activeTab === 'formular' && betrieb && (
          <div className="space-y-6">

            {/* Vorschau */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#2a2a2a] flex items-center justify-between">
                <p className="text-xs text-[#444] uppercase tracking-widest">Vorschau</p>
                <span className="text-xs text-[#555]">So sehen deine Dokumente aus</span>
              </div>
              {/* Mini-Briefkopf Vorschau */}
              <div className="p-6">
                <div style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '24px',
                  fontFamily: betrieb.schriftart === 'georgia' ? 'Georgia, serif' : betrieb.schriftart === 'courier' ? 'Courier New, monospace' : 'Arial, sans-serif',
                  color: '#1a1a1a',
                  border: '1px solid #eee',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #eee' }}>
                    <div>
                      {betrieb.logo_url
                        ? <img src={betrieb.logo_url} alt="Logo" style={{ height: '40px', objectFit: 'contain', marginBottom: '6px' }}/>
                        : null}
                      <p style={{ fontSize: '14px', fontWeight: 700, color: betrieb.farbe_primary || '#0c0c0c' }}>{betrieb.name || 'Dein Betrieb'}</p>
                      <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{betrieb.adresse || 'Adresse'}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '16px', fontWeight: 800, color: betrieb.farbe_accent || '#d4e840', letterSpacing: '-0.5px' }}>ANGEBOT</p>
                      <p style={{ fontSize: '9px', color: '#888' }}>Nr. 2026-A-001</p>
                    </div>
                  </div>
                  <div style={{ background: (betrieb.farbe_accent || '#d4e840') + '15', borderLeft: `3px solid ${betrieb.farbe_accent || '#d4e840'}`, padding: '8px 12px', borderRadius: '0 4px 4px 0', fontSize: '11px', color: '#333' }}>
                    Muster · Angebot · Vorschau
                  </div>
                </div>
              </div>
            </div>

            {/* Farben */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-5">Farben</p>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-xs text-[#666] mb-2 block">Primärfarbe (Firmenname, Überschriften)</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={betrieb.farbe_primary || '#0c0c0c'}
                      onChange={e => set('farbe_primary', e.target.value)}
                      className="w-12 h-10 rounded-lg border border-[#2a2a2a] bg-transparent cursor-pointer"/>
                    <input type="text" value={betrieb.farbe_primary || '#0c0c0c'}
                      onChange={e => set('farbe_primary', e.target.value)}
                      className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0ede8] font-mono focus:outline-none focus:border-[#d4e840]"/>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#666] mb-2 block">Akzentfarbe (Dokumenttyp, Highlights)</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={betrieb.farbe_accent || '#d4e840'}
                      onChange={e => set('farbe_accent', e.target.value)}
                      className="w-12 h-10 rounded-lg border border-[#2a2a2a] bg-transparent cursor-pointer"/>
                    <input type="text" value={betrieb.farbe_accent || '#d4e840'}
                      onChange={e => set('farbe_accent', e.target.value)}
                      className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-[#f0ede8] font-mono focus:outline-none focus:border-[#d4e840]"/>
                  </div>
                </div>
              </div>
              {/* Schnellauswahl */}
              <div className="mt-4">
                <p className="text-xs text-[#444] mb-2">Schnellauswahl</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { primary: '#0c0c0c', accent: '#d4e840', label: 'Standard' },
                    { primary: '#1a3a5c', accent: '#e85d24', label: 'Klassisch' },
                    { primary: '#1a1a1a', accent: '#1d9e75', label: 'Grün' },
                    { primary: '#2d1a4a', accent: '#9b59b6', label: 'Lila' },
                    { primary: '#1a1a1a', accent: '#e74c3c', label: 'Rot' },
                    { primary: '#2c3e50', accent: '#3498db', label: 'Blau' },
                  ].map(combo => (
                    <button key={combo.label} type="button"
                      onClick={() => { set('farbe_primary', combo.primary); set('farbe_accent', combo.accent) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-xs text-[#888] hover:border-[#444] transition-all">
                      <span style={{ background: combo.primary, width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }}/>
                      <span style={{ background: combo.accent,  width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' }}/>
                      {combo.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Schrift */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Schriftart</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { id: 'helvetica', label: 'Helvetica', preview: 'Aa' },
                  { id: 'georgia',   label: 'Georgia',   preview: 'Aa' },
                  { id: 'arial',     label: 'Arial',     preview: 'Aa' },
                  { id: 'courier',   label: 'Courier',   preview: 'Aa' },
                ].map(f => (
                  <button key={f.id} type="button"
                    onClick={() => set('schriftart', f.id)}
                    className={`p-4 rounded-xl border text-center transition-all ${betrieb.schriftart === f.id ? 'border-[#d4e840] bg-[#d4e840]/10' : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'}`}>
                    <p style={{ fontFamily: f.id === 'georgia' ? 'Georgia,serif' : f.id === 'courier' ? 'monospace' : 'Arial,sans-serif', fontSize: '22px' }}>{f.preview}</p>
                    <p className="text-xs text-[#555] mt-1">{f.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Stil */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#444] uppercase tracking-widest mb-4">Dokumentstil</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {STILE.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => set('formular_stil', s.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${betrieb.formular_stil === s.id ? 'border-[#d4e840] bg-[#d4e840]/10' : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'}`}>
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className="text-xs text-[#555] mt-1">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" onClick={speichern} disabled={saving}
              className="w-full bg-[#d4e840] text-black font-medium py-3 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
              {saving ? 'Speichern...' : saved ? '✓ Gespeichert' : 'Design speichern'}
            </button>
          </div>
        )}

        {/* ─── TAB: TOKEN ─── */}
        {activeTab === 'token' && (
          <div className="space-y-6">

            {/* Guthaben */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-[#444] uppercase tracking-widest">Aktuelles Guthaben</p>
                <span className="text-3xl font-semibold text-[#d4e840] tabular-nums">{tokenGuthaben}</span>
              </div>
              <div className="bg-[#111] rounded-full h-2 overflow-hidden">
                <div className="h-full bg-[#d4e840] rounded-full transition-all" style={{ width: `${Math.min((tokenGuthaben/100)*100, 100)}%` }}/>
              </div>
              <p className="text-xs text-[#444] mt-2">
                ~{Math.floor(tokenGuthaben / 1.5)} Dokumente verbleibend ·
                <span className="text-[#555]"> Angebot = 2 Token, Rechnung = 1 Token, Bautagebuch = 1 Token</span>
              </p>
            </div>

            {/* Pakete */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PAKETE.map(paket => (
                <div key={paket.id}
                  className={`bg-[#181818] rounded-2xl p-6 flex flex-col ${paket.beliebt ? 'border-2 border-[#d4e840]' : 'border border-[#2a2a2a]'}`}>
                  {paket.beliebt && (
                    <span className="text-xs bg-[#d4e840]/20 text-[#d4e840] px-3 py-1 rounded-full self-start mb-4 font-medium">Beliebt</span>
                  )}
                  <p className="text-lg font-semibold">{paket.name}</p>
                  <p className="text-4xl font-bold mt-3 tabular-nums">{paket.token}</p>
                  <p className="text-sm text-[#555] mb-1">Token</p>
                  <p className="text-xl font-medium text-[#d4e840] mb-6">{paket.preis} €</p>
                  <p className="text-xs text-[#444] mb-4 flex-1">
                    ~{Math.floor(paket.token / 1.5)} Dokumente ·
                    {paket.id === 'starter' ? ' Perfekt zum Starten' : paket.id === 'pro' ? ' Für aktive Betriebe' : ' Für Teams'}
                  </p>
                  <button type="button" onClick={() => tokenKaufen(paket)} disabled={tokenLoading === paket.id}
                    className={`w-full py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-40 ${paket.beliebt ? 'bg-[#d4e840] text-black hover:opacity-90' : 'bg-[#2a2a2a] text-[#f0ede8] hover:bg-[#333]'}`}>
                    {tokenLoading === paket.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Wird weitergeleitet...
                      </span>
                    ) : `${paket.preis} € bezahlen`}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#333] text-center">
              Sicherer Kauf über Stripe · Keine Abonnement-Pflicht · Token verfallen nicht
            </p>
          </div>
        )}
      </div>
      <div className="h-24 md:h-8"/>
    </div>
  )
}
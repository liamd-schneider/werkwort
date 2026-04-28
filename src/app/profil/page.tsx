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

// Vorschau-Position beim Import (bevor sie gespeichert wird)
interface ImportPosition {
  beschreibung: string
  einheit: string
  preis: number
  istDuplikat: boolean
  duplikatHinweis?: string
  ausgewaehlt: boolean
}

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

// Exakter Vergleich (case-insensitiv, Whitespace ignoriert)
function exaktGleich(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim()
}

function ProfilPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [betrieb, setBetrieb]           = useState<Betrieb | null>(null)
  const [preise, setPreise]             = useState<Preisposition[]>([])
  const [tokenGuthaben, setToken]       = useState(0)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [logoUploading, setLogoUp]      = useState(false)
  const [successMsg, setSuccessMsg]     = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState<'betrieb'|'formular'|'preise'>('betrieb')
  const [neuePreis, setNeuePreis]       = useState({ beschreibung: '', einheit: 'm²', preis: '' })
  const [importLoading, setImportLoading] = useState(false)
  const [importVorschau, setImportVorschau] = useState<ImportPosition[] | null>(null)
  const [importSpeichernLoading, setImportSpeichernLoading] = useState(false)
  const [importFehler, setImportFehler]   = useState<string | null>(null)
  const [dragOver, setDragOver]           = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const logoInput   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfil()
    if (searchParams.get('success') === '1') {
      const t = searchParams.get('token')
      setSuccessMsg(`✓ Zahlung erfolgreich! ${t} Token wurden gutgeschrieben.`)
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
    await supabase.storage.from('logos').remove([
      `${user.id}/logo.png`,
      `${user.id}/logo.jpg`,
      `${user.id}/logo.jpeg`,
    ])
    await (supabase as any).from('betriebe').update({ logo_url: null }).eq('id', betrieb.id)
    setBetrieb({ ...betrieb, logo_url: null })
  }

  const preisLoeschen = async (id: string) => {
    await (supabase as any).from('preispositionen').delete().eq('id', id)
    setPreise(preise.filter(p => p.id !== id))
  }

  const preisHinzufuegen = async () => {
    if (!neuePreis.beschreibung || !neuePreis.preis) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await (supabase as any).from('preispositionen').insert({
      user_id: user.id, beschreibung: neuePreis.beschreibung,
      einheit: neuePreis.einheit, preis: parseFloat(neuePreis.preis),
    }).select().single()
    if (data) { setPreise([...preise, data]); setNeuePreis({ beschreibung: '', einheit: 'm²', preis: '' }) }
  }

  // ─── IMPORT: Schritt 1 – Datei hochladen, Vorschau aufbauen ───
  const importDatei = async (file: File) => {
    setImportLoading(true)
    setImportVorschau(null)
    setImportFehler(null)

    const { data: { session } } = await supabase.auth.getSession()
    const fd = new FormData()
    fd.append('file', file)

    try {
      const res  = await fetch('/api/preisliste', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body:    fd,
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setImportFehler(data.error || 'Fehler beim Importieren')
      } else {
        // API gibt { positionen: [{beschreibung, einheit, preis}] } zurück
        // Nur exakte Duplikate markieren (gleiche Beschreibung + gleiche Einheit)
        const positionen: ImportPosition[] = (data.positionen || []).map((p: any) => {
          const duplikat = preise.find(existing =>
            exaktGleich(existing.beschreibung, p.beschreibung) && existing.einheit === p.einheit
          )
          return {
            beschreibung: p.beschreibung,
            einheit: p.einheit,
            preis: p.preis,
            istDuplikat: !!duplikat,
            duplikatHinweis: duplikat
              ? `Bereits vorhanden: „${duplikat.beschreibung}" (${duplikat.preis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/${duplikat.einheit})`
              : undefined,
            ausgewaehlt: !duplikat, // Duplikate standardmäßig abgewählt
          }
        })
        setImportVorschau(positionen)
      }
    } catch (err: any) {
      setImportFehler('Verbindungsfehler: ' + err.message)
    }
    setImportLoading(false)
  }

  // ─── IMPORT: Schritt 2 – ausgewählte Positionen speichern ───
  const importBestaetigen = async () => {
    if (!importVorschau) return
    setImportSpeichernLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const zuSpeichern = importVorschau.filter(p => p.ausgewaehlt)
    if (zuSpeichern.length > 0) {
      const { data: neu } = await (supabase as any).from('preispositionen').insert(
        zuSpeichern.map(p => ({
          user_id: user.id,
          beschreibung: p.beschreibung,
          einheit: p.einheit,
          preis: p.preis,
        }))
      ).select()
      if (neu) setPreise(prev => [...prev, ...neu])
    }

    setImportVorschau(null)
    setImportSpeichernLoading(false)
  }

  const importVorschauUpdate = (index: number, changes: Partial<ImportPosition>) => {
    setImportVorschau(prev => prev
      ? prev.map((p, i) => i === index ? { ...p, ...changes } : p)
      : prev
    )
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) importDatei(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) importDatei(file)
  }

  const set = (field: keyof Betrieb, value: string) => {
    if (!betrieb) return
    setBetrieb({ ...betrieb, [field]: value })
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0c0c0c] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#d4e840] border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const alleAusgewaehlt = importVorschau?.every(p => p.ausgewaehlt) ?? false
  const anzahlAusgewaehlt = importVorschau?.filter(p => p.ausgewaehlt).length ?? 0

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {/* Top Bar */}
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-medium text-white">Profil</h1>
        <button type="button"
          onClick={async () => { await supabase.auth.signOut(); router.push('/auth') }}
          className="text-sm text-[#999] hover:text-[#aaa] transition-colors">
          Ausloggen
        </button>
      </div>

      {successMsg && (
        <div className={`px-6 py-3 text-sm text-center border-b ${
          successMsg.startsWith('✓')
            ? 'bg-[#00D4AA]/10 text-[#00D4AA] border-[#00D4AA]/20'
            : 'bg-[#2a2a2a] text-[#ccc] border-[#333]'
        }`}>
          {successMsg}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-6">

        {/* ─── TABS ─── */}
        {/* Desktop */}
        <div className="hidden sm:flex bg-[#181818] border border-[#2a2a2a] rounded-xl p-1 mb-8 gap-1">
          {([
            { id: 'betrieb',  label: 'Betrieb' },
            { id: 'formular', label: 'Formulardesign' },
            { id: 'preise',   label: 'Preisliste' },
          ] as const).map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-[#2a2a2a] text-white font-medium'
                  : 'text-[#888] hover:text-[#ccc]'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Mobile */}
        <div className="grid grid-cols-3 gap-2 sm:hidden mb-6">
          {([
            { id: 'betrieb',  label: 'Betrieb' },
            { id: 'formular', label: 'Design' },
            { id: 'preise',   label: 'Preisliste' },
          ] as const).map(tab => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-2 text-sm rounded-xl border transition-all font-medium ${
                activeTab === tab.id
                  ? 'bg-[#d4e840]/10 border-[#d4e840]/50 text-[#d4e840]'
                  : 'bg-[#181818] border-[#2a2a2a] text-[#888] hover:text-[#ccc] hover:border-[#444]'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── BETRIEB ─── */}
        {activeTab === 'betrieb' && betrieb && (
          <div className="space-y-6">
            {/* Logo */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#999] uppercase tracking-widest mb-4">Logo</p>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 bg-[#111] border border-[#2a2a2a] rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {betrieb.logo_url
                    ? <img src={betrieb.logo_url} alt="Logo" className="w-full h-full object-contain p-2"/>
                    : <span className="text-2xl font-bold text-[#777]">{betrieb.name.slice(0,2).toUpperCase()}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  <input ref={logoInput} type="file" accept="image/*" onChange={logoHochladen} className="hidden"/>
                  <button type="button" onClick={() => logoInput.current?.click()} disabled={logoUploading}
                    className="px-4 py-2 bg-[#d4e840] text-black text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40">
                    {logoUploading ? 'Lädt hoch...' : 'Logo hochladen'}
                  </button>
                  {betrieb.logo_url && (
                    <button type="button" onClick={logoLoeschen}
                      className="px-4 py-2 border border-red-500/30 text-red-400/80 text-sm rounded-lg hover:text-red-400 transition-all">
                      Logo entfernen
                    </button>
                  )}
                  <p className="text-xs text-[#999]">PNG, JPG — max. 2MB</p>
                </div>
              </div>
            </div>

            {/* Betriebsdaten */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#999] uppercase tracking-widest mb-5">Betriebsdaten</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Betriebsname *', key: 'name',         placeholder: 'Bauer Fliesen GmbH' },
                  { label: 'Adresse',        key: 'adresse',      placeholder: 'Musterstraße 1, 65549 Limburg', full: true },
                  { label: 'Telefon',        key: 'telefon',      placeholder: '+49 6431 123456' },
                  { label: 'E-Mail',         key: 'email',        placeholder: 'info@bauer-fliesen.de' },
                  { label: 'Website',        key: 'website',      placeholder: 'www.bauer-fliesen.de' },
                  { label: 'Steuernummer',   key: 'steuernummer', placeholder: '123/456/78901' },
                  { label: 'IBAN',           key: 'iban',         placeholder: 'DE12 3456 7890 1234 5678 90', full: true },
                  { label: 'Fußzeile',       key: 'fusszeile',    placeholder: 'Mitglied der HWK · USt-IdNr: DE123456789', full: true },
                ].map(f => (
                  <div key={f.key} className={(f as any).full ? 'md:col-span-2' : ''}>
                    <label className="text-xs text-[#888] mb-1.5 block">{f.label}</label>
                    <input type="text" value={(betrieb as any)[f.key] || ''}
                      onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
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
                <p className="text-xs text-[#999] uppercase tracking-widest">Vorschau</p>
              </div>
              <div className="p-6">
                <div style={{
                  background: 'white', borderRadius: '8px', padding: '24px', border: '1px solid #eee',
                  fontFamily: betrieb.schriftart === 'georgia' ? 'Georgia,serif'
                            : betrieb.schriftart === 'courier' ? 'monospace'
                            : 'Arial,sans-serif',
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
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[['Fliesenlegen', '45,00 €/m²', '20 m²', '900,00 €'], ['Material pauschal', '—', '1x', '350,00 €']].map(([desc, preis, menge, summe], i) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'8px', fontSize:'9px', color:'#555', borderBottom:'1px solid #f0f0f0', paddingBottom:'4px', alignItems:'center' }}>
                        <span>{desc}</span>
                        <span style={{ textAlign:'right', color:'#888' }}>{preis}</span>
                        <span style={{ textAlign:'right', color:'#888' }}>{menge}</span>
                        <span style={{ textAlign:'right', fontWeight:600, color: betrieb.farbe_primary||'#0c0c0c' }}>{summe}</span>
                      </div>
                    ))}
                    <div style={{ display:'flex', justifyContent:'flex-end', fontSize:'11px', fontWeight:700, color: betrieb.farbe_accent||'#d4e840', marginTop:'4px' }}>
                      Gesamt: 1.250,00 €
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Farben */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#999] uppercase tracking-widest mb-5">Farben</p>
              <div className="grid grid-cols-1 gap-4 mb-4 sm:grid-cols-2">
                {[
                  { label: 'Primärfarbe', key: 'farbe_primary', def: '#0c0c0c' },
                  { label: 'Akzentfarbe', key: 'farbe_accent',  def: '#d4e840' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-[#888] mb-2 block">{f.label}</label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={(betrieb as any)[f.key]||f.def}
                        onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                        className="w-12 h-10 rounded-lg border border-[#2a2a2a] cursor-pointer bg-transparent flex-shrink-0"/>
                      <input type="text" value={(betrieb as any)[f.key]||f.def}
                        onChange={e => set(f.key as keyof Betrieb, e.target.value)}
                        className="flex-1 min-w-0 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#d4e840]"/>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#999] mb-2">Farbkombinationen</p>
              <div className="flex gap-2 flex-wrap">
                {[
                  ['#0c0c0c','#d4e840','Standard'],
                  ['#1a3a5c','#e85d24','Klassisch'],
                  ['#1a1a1a','#00D4AA','Mint'],
                  ['#2c3e50','#3498db','Blau'],
                  ['#1a1a1a','#e74c3c','Rot'],
                  ['#2d1a4a','#9b59b6','Lila'],
                ].map(([p,a,l]) => (
                  <button key={l} type="button"
                    onClick={() => { set('farbe_primary',p); set('farbe_accent',a) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-xs text-[#aaa] hover:border-[#444] transition-all">
                    <span style={{ background:p, width:10, height:10, borderRadius:'50%', display:'inline-block', border:'1px solid #333' }}/>
                    <span style={{ background:a, width:10, height:10, borderRadius:'50%', display:'inline-block' }}/>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Schriftart + Stil */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <p className="text-xs text-[#999] uppercase tracking-widest mb-4">Schriftart</p>
                <div className="grid grid-cols-2 gap-2">
                  {[['helvetica','Helvetica'],['georgia','Georgia'],['arial','Arial'],['courier','Courier']].map(([id,label]) => (
                    <button key={id} type="button" onClick={() => set('schriftart', id)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        betrieb.schriftart===id
                          ? 'border-[#d4e840] bg-[#d4e840]/10'
                          : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'
                      }`}>
                      <p style={{ fontFamily: id==='georgia'?'Georgia,serif':id==='courier'?'monospace':'Arial,sans-serif', fontSize:'20px', color:'#fff' }}>Aa</p>
                      <p className="text-xs text-[#888] mt-1">{label}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <p className="text-xs text-[#999] uppercase tracking-widest mb-4">Dokumentstil</p>
                <div className="space-y-2">
                  {STILE.map(s => (
                    <button key={s.id} type="button" onClick={() => set('formular_stil', s.id)}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${
                        betrieb.formular_stil===s.id
                          ? 'border-[#d4e840] bg-[#d4e840]/10'
                          : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'
                      }`}>
                      <p className="font-medium text-sm text-white">{s.label}</p>
                      <p className="text-xs text-[#888] mt-0.5">{s.desc}</p>
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
          <div className="space-y-5">

            {/* ── SCHRITT 1: Upload (nur wenn keine Vorschau aktiv) ── */}
            {!importVorschau && (
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-[#999] uppercase tracking-widest">KI-Import</p>
                  <span className="text-xs bg-[#00D4AA]/15 text-[#00D4AA] px-2 py-0.5 rounded-full border border-[#00D4AA]/25">Kostenlos</span>
                </div>
                <p className="text-xs text-[#888] mb-4 leading-relaxed">
                  Foto von deiner Preistabelle, Excel-Tabelle, PDF oder handgeschriebene Liste — die KI erkennt alle Positionen. Du siehst sie vor dem Speichern.
                </p>

                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  onClick={() => !importLoading && importInput.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    dragOver
                      ? 'border-[#00D4AA] bg-[#00D4AA]/5'
                      : 'border-[#2a2a2a] hover:border-[#00D4AA]/50 hover:bg-[#00D4AA]/3'
                  } ${importLoading ? 'cursor-wait pointer-events-none' : ''}`}>
                  <input ref={importInput} type="file" accept="image/*,.pdf" onChange={onFileChange} className="hidden"/>
                  {importLoading ? (
                    <div className="flex flex-col items-center gap-3">
                      <svg className="animate-spin w-8 h-8 text-[#00D4AA]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      <p className="text-sm text-[#ccc]">KI analysiert deine Datei...</p>
                      <p className="text-xs text-[#999]">Einen Moment bitte</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 bg-[#00D4AA]/10 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#00D4AA]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                          <path d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-[#ccc]">Datei hier ablegen oder klicken</p>
                        <p className="text-xs text-[#999] mt-1">Foto · PDF</p>
                      </div>
                    </div>
                  )}
                </div>

                {importFehler && (
                  <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round"/>
                    </svg>
                    <p className="text-sm text-red-400">{importFehler}</p>
                    <button type="button" onClick={() => setImportFehler(null)} className="ml-auto text-red-400/40 hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── SCHRITT 2: Vorschau & Bestätigen ── */}
            {importVorschau && (
              <div className="bg-[#181818] border border-[#00D4AA]/30 rounded-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[#2a2a2a] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {importVorschau.length} {importVorschau.length === 1 ? 'Position' : 'Positionen'} erkannt
                    </p>
                    <p className="text-xs text-[#888] mt-0.5">
                      Prüfe und bearbeite die Positionen, dann hinzufügen.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportVorschau(prev => prev?.map(p => ({ ...p, ausgewaehlt: !alleAusgewaehlt })) ?? prev)}
                    className="text-xs text-[#00D4AA] hover:text-[#00D4AA]/70 transition-colors whitespace-nowrap flex-shrink-0"
                  >
                    {alleAusgewaehlt ? 'Alle abwählen' : 'Alle auswählen'}
                  </button>
                </div>

                {/* Positionen */}
                <div className="divide-y divide-[#1e1e1e]">
                  {importVorschau.map((pos, idx) => (
                    <div key={idx} className={`px-6 py-4 transition-colors ${pos.ausgewaehlt ? '' : 'opacity-40'}`}>
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => importVorschauUpdate(idx, { ausgewaehlt: !pos.ausgewaehlt })}
                          className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            pos.ausgewaehlt
                              ? 'bg-[#00D4AA] border-[#00D4AA]'
                              : 'border-[#444] bg-transparent'
                          }`}
                        >
                          {pos.ausgewaehlt && (
                            <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </button>

                        {/* Felder */}
                        <div className="flex-1 min-w-0">
                          {/* Duplikat-Warnung */}
                          {pos.istDuplikat && (
                            <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-400/80">
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round"/>
                              </svg>
                              <span>{pos.duplikatHinweis}</span>
                            </div>
                          )}

                          {/* Beschreibung */}
                          <input
                            type="text"
                            value={pos.beschreibung}
                            onChange={e => importVorschauUpdate(idx, { beschreibung: e.target.value })}
                            className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#00D4AA] transition-colors mb-2"
                          />

                          {/* Preis + Einheit */}
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                value={pos.preis}
                                onChange={e => importVorschauUpdate(idx, { preis: parseFloat(e.target.value) || 0 })}
                                className="w-full bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4AA] transition-colors pr-8"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#666]">€</span>
                            </div>
                            <select
                              value={pos.einheit}
                              onChange={e => importVorschauUpdate(idx, { einheit: e.target.value })}
                              className="bg-[#111] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00D4AA] transition-colors"
                            >
                              {['m²','Stk.','Std.','m','pauschal'].map(e => <option key={e}>{e}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Löschen (aus Vorschau entfernen) */}
                        <button
                          type="button"
                          onClick={() => setImportVorschau(prev => prev?.filter((_, i) => i !== idx) ?? null)}
                          className="text-[#555] hover:text-red-400 transition-colors flex-shrink-0 mt-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[#2a2a2a] flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setImportVorschau(null)}
                    className="px-4 py-2.5 text-sm text-[#888] hover:text-white border border-[#2a2a2a] rounded-xl transition-all"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={importBestaetigen}
                    disabled={importSpeichernLoading || anzahlAusgewaehlt === 0}
                    className="flex-1 bg-[#00D4AA] text-black font-medium py-2.5 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all text-sm"
                  >
                    {importSpeichernLoading
                      ? 'Wird gespeichert...'
                      : anzahlAusgewaehlt === 0
                        ? 'Keine ausgewählt'
                        : `${anzahlAusgewaehlt} ${anzahlAusgewaehlt === 1 ? 'Position' : 'Positionen'} hinzufügen`
                    }
                  </button>
                </div>
              </div>
            )}

            {/* ── Preisliste ── */}
            <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
              <p className="text-xs text-[#999] uppercase tracking-widest mb-1">Meine Preisliste</p>
              <p className="text-xs text-[#888] mb-5 leading-relaxed">
                Die KI übernimmt diese Preise automatisch bei der Dokumenterstellung.
              </p>

              {preise.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-[#2a2a2a] rounded-xl mb-5">
                  <p className="text-sm text-[#999]">Noch keine Preise hinterlegt</p>
                  <p className="text-xs text-[#888] mt-1">Importiere eine Datei oder trage Preise manuell ein</p>
                </div>
              ) : (
                <div className="space-y-2 mb-5">
                  {preise.map(p => (
                    <div key={p.id} className="flex items-start justify-between bg-[#111] rounded-xl px-4 py-3 group gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white leading-snug">{p.beschreibung}</p>
                        <p className="text-xs text-[#00D4AA] mt-0.5 tabular-nums">
                          {p.preis.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/{p.einheit}
                        </p>
                      </div>
                      <button type="button" onClick={() => preisLoeschen(p.id)}
                        className="text-[#777] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Manuell hinzufügen */}
              <div className="border-t border-[#2a2a2a] pt-5">
                <p className="text-xs text-[#999] mb-3">Manuell hinzufügen</p>
                <div className="flex flex-col gap-2">
                  <input type="text" value={neuePreis.beschreibung}
                    onChange={e => setNeuePreis({ ...neuePreis, beschreibung: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && preisHinzufuegen()}
                    placeholder="Beschreibung, z.B. Fliesenlegen"
                    className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input type="number" value={neuePreis.preis}
                      onChange={e => setNeuePreis({ ...neuePreis, preis: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && preisHinzufuegen()}
                      placeholder="Preis in €"
                      className="flex-1 bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#d4e840] transition-colors"/>
                    <select value={neuePreis.einheit}
                      onChange={e => setNeuePreis({ ...neuePreis, einheit: e.target.value })}
                      className="w-full sm:w-auto bg-[#111] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4e840] transition-colors">
                      {['m²','Stk.','Std.','m','pauschal'].map(e => <option key={e}>{e}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={preisHinzufuegen}
                    disabled={!neuePreis.beschreibung || !neuePreis.preis}
                    className="w-full bg-[#d4e840] text-black rounded-xl py-2.5 text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-all">
                    + Hinzufügen
                  </button>
                </div>
                <p className="text-xs text-[#999] mt-2">
                  z.B. Fliesenlegen 45 €/m² · Arbeitsstunde 65 €/Std.
                </p>
              </div>
            </div>
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
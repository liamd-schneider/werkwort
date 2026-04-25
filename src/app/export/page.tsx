'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Stats {
  anzahl: number; sumNetto: number; sumMwst: number; sumBrutto: number
  bezahlt: number; offen: number; ueberfaellig: number
}

// ─── DATEV Checker Types ──────────────────────────────────────────────────────
interface CheckItem {
  type: 'ok' | 'warn' | 'err'
  title: string
  detail: string
}

interface Buchung {
  zeile: number
  betrag: string
  sh: string
  konto: string
  gegenkonto: string
  belegdatum: string
  belegfeld1: string
  buchungstext: string
}

interface CheckResult {
  header: Record<string, string>
  buchungen: Buchung[]
  checks: CheckItem[]
  stats: { errors: number; warnings: number; oks: number; total: number }
  kontoSummen: Record<string, number>
}

// ─── Konten SKR03 ────────────────────────────────────────────────────────────
const KONTEN_SKR03: Record<string, string> = {
  '1000': 'Kasse', '1200': 'Bank', '1400': 'Forderungen L+L',
  '1600': 'Verbindlichkeiten L+L', '1770': 'USt 19%', '1771': 'USt 7%',
  '1780': 'USt-Vorauszahlungen', '8400': 'Erlöse 19% USt', '8300': 'Erlöse 7% USt',
  '8100': 'Erlöse steuerfrei', '8200': 'Erlöse 7% (§13b)', '4000': 'Löhne',
  '4100': 'Sozialaufwendungen', '4300': 'Raumkosten', '4360': 'Reinigung',
  '4400': 'Kfz-Kosten', '4500': 'Werbe-/Reisekosten', '4600': 'Warenabgabe',
  '4800': 'Porto', '4830': 'Telefon', '4900': 'Sonstige Betriebsausgaben',
  '4930': 'Buchführungskosten', '4970': 'Beratungskosten',
  '7000': 'Materialaufwand', '7100': 'Hilfs-/Betriebsstoffe',
}

// ─── Konten SKR04 ────────────────────────────────────────────────────────────
const KONTEN_SKR04: Record<string, string> = {
  '1200': 'Forderungen L+L', '1800': 'Bank', '1600': 'Verbindlichkeiten',
  '1750': 'USt 19%', '1751': 'USt 7%', '4400': 'Erlöse 19% USt',
  '4300': 'Erlöse 7% USt', '4100': 'Erlöse steuerfrei', '6000': 'Löhne',
  '6010': 'Sozialaufwendungen', '6300': 'Raumkosten', '6400': 'Kfz-Kosten',
  '6800': 'Porto', '6805': 'Telefon', '6900': 'Sonstige Betriebsausg.',
  '6930': 'Buchführung', '5000': 'Materialaufwand', '5100': 'Hilfs-/Betriebsstoffe',
}

function getKontoName(nr: string, skr: 'SKR03' | 'SKR04' = 'SKR03'): string {
  const map = skr === 'SKR04' ? KONTEN_SKR04 : KONTEN_SKR03
  if (map[nr]) return map[nr]
  const n = parseInt(nr)
  if (skr === 'SKR03') {
    if (n >= 8000 && n <= 8999) return 'Erlöskonto'
    if (n >= 7000 && n <= 7999) return 'Materialkonto'
    if (n >= 4000 && n <= 4999) return 'Aufwandskonto'
    if (n >= 1000 && n <= 1099) return 'Kassenkonto'
    if (n >= 1200 && n <= 1299) return 'Bankkonto'
    if (n >= 1400 && n <= 1499) return 'Forderungskonto'
    if (n >= 1600 && n <= 1699) return 'Verbindlichkeitskonto'
  } else {
    if (n >= 4000 && n <= 4499) return 'Erlöskonto'
    if (n >= 5000 && n <= 5999) return 'Materialkonto'
    if (n >= 6000 && n <= 6999) return 'Aufwandskonto'
    if (n >= 1800 && n <= 1899) return 'Bankkonto'
    if (n >= 1200 && n <= 1299) return 'Forderungskonto'
    if (n >= 1600 && n <= 1699) return 'Verbindlichkeitskonto'
  }
  if (n >= 0 && n <= 999) return 'Anlagevermögen'
  return '(unbekannt)'
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ';' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

function parseBetrag(str: string): number {
  return parseFloat(str.replace(',', '.'))
}

function formatBetrag(str: string): string {
  const v = parseBetrag(str)
  if (isNaN(v)) return str
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €'
}

function analyzeFile(text: string): CheckResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const h = parseCSVLine(lines[0])

  const header: Record<string, string> = {
    formatKennung: h[0]?.replace(/"/g, ''),
    version:       h[1],
    dateiTyp:      h[3]?.replace(/"/g, ''),
    beraternr:     h[10],
    mandantnr:     h[11],
    wjBeginn:      h[12],
    buchungsVon:   h[14],
    buchungsBis:   h[15],
    bezeichnung:   h[16]?.replace(/"/g, ''),
    waehrung:      h[21]?.replace(/"/g, ''),
  }

  const buchungen: Buchung[] = []
  for (let i = 2; i < lines.length; i++) {
    const c = parseCSVLine(lines[i])
    if (c.length < 8) continue
    buchungen.push({
      zeile: i + 1, betrag: c[0], sh: c[1]?.replace(/"/g, ''),
      konto: c[6], gegenkonto: c[7], belegdatum: c[9],
      belegfeld1: c[10]?.replace(/"/g, ''), buchungstext: c[13]?.replace(/"/g, ''),
    })
  }

  const checks: CheckItem[] = []
  let errors = 0, warnings = 0, oks = 0

  const chk = (type: 'ok'|'warn'|'err', title: string, detail = '') => {
    checks.push({ type, title, detail })
    if (type === 'ok') oks++
    else if (type === 'warn') warnings++
    else errors++
  }

  header.formatKennung === 'EXTF'
    ? chk('ok',   'EXTF-Formatkennung korrekt', `Version: ${header.version}`)
    : chk('err',  'Keine EXTF-Kennung', `Gefunden: "${header.formatKennung}"`)
  header.dateiTyp === 'Buchungsstapel'
    ? chk('ok',   'Datei-Typ korrekt', 'Buchungsstapel')
    : chk('warn', 'Unbekannter Datei-Typ', `"${header.dateiTyp}"`)
  header.waehrung === 'EUR'
    ? chk('ok',   'Währung EUR korrekt')
    : chk('warn', 'Abweichende Währung', `"${header.waehrung}"`)
  header.buchungsVon && header.buchungsBis
    ? chk('ok',   'Buchungsperiode angegeben', `${header.buchungsVon} → ${header.buchungsBis}`)
    : chk('warn', 'Buchungsperiode fehlt')
  buchungen.length > 0
    ? chk('ok',   `${buchungen.length} Buchungszeilen gefunden`)
    : chk('err',  'Keine Buchungszeilen gefunden')

  const shFehler = buchungen.filter(b => b.sh !== 'S' && b.sh !== 'H')
  shFehler.length === 0
    ? chk('ok',   'S/H-Kennzeichen korrekt', 'Alle Buchungen: S oder H')
    : chk('err',  `${shFehler.length} fehlerhafte S/H-Kennzeichen`, `Zeilen: ${shFehler.map(b => b.zeile).join(', ')}`)

  const betragFehler = buchungen.filter(b => { const v = parseBetrag(b.betrag); return isNaN(v) || v <= 0 })
  betragFehler.length === 0
    ? chk('ok',   'Alle Beträge gültig (> 0)')
    : chk('err',  `${betragFehler.length} ungültige Beträge`, `Zeilen: ${betragFehler.map(b => b.zeile).join(', ')}`)

  const ohneText = buchungen.filter(b => !b.buchungstext?.trim())
  ohneText.length === 0
    ? chk('ok',   'Alle Buchungen haben Buchungstext')
    : chk('warn', `${ohneText.length} Buchungen ohne Buchungstext`, `Zeilen: ${ohneText.map(b => b.zeile).join(', ')}`)

  const ohneBelegnr = buchungen.filter(b => !b.belegfeld1?.trim())
  ohneBelegnr.length === 0
    ? chk('ok',   'Alle Buchungen haben Belegnummer')
    : chk('warn', `${ohneBelegnr.length} Buchungen ohne Belegnummer`, `Zeilen: ${ohneBelegnr.map(b => b.zeile).join(', ')}`)

  const belegfelder = buchungen.map(b => b.belegfeld1).filter(Boolean)
  const duplikate = belegfelder.filter((v, i, a) => a.indexOf(v) !== i)
  duplikate.length === 0
    ? chk('ok',   'Keine doppelten Belegnummern')
    : chk('warn', `Doppelte Belegnummern: ${[...new Set(duplikate)].join(', ')}`, 'Prüfen ob beabsichtigt (z.B. Teilzahlungen)')

  const kontoSummen: Record<string, number> = {}
  buchungen.forEach(b => {
    const v = parseBetrag(b.betrag)
    if (!isNaN(v)) kontoSummen[b.konto] = (kontoSummen[b.konto] || 0) + v
  })

  return { header, buchungen, checks, stats: { errors, warnings, oks, total: buchungen.length }, kontoSummen }
}

// ─── Checker Modal ────────────────────────────────────────────────────────────
function DatevCheckerModal({ onClose, skr }: { onClose: () => void; skr: 'SKR03' | 'SKR04' }) {
  const [result, setResult] = useState<CheckResult | null>(null)
  const [filename, setFilename] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string).replace(/^\uFEFF/, '')
      setResult(analyzeFile(text))
    }
    reader.readAsText(file, 'windows-1252')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header — grüner Akzent */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#00D4AA]/20 bg-[#00D4AA]/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-[#00D4AA]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/>
            </svg>
            <h2 className="font-medium text-white">DATEV CSV Prüfung</h2>
            <span className="text-xs bg-[#00D4AA]/15 text-[#00D4AA] px-2 py-0.5 rounded-full font-medium">{skr}</span>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#f0ede8] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => fileRef.current?.click()}
            className={`border rounded-xl p-8 text-center cursor-pointer transition-all ${
              dragging ? 'border-[#00D4AA] bg-[#00D4AA]/5' : 'border-dashed border-[#2a2a2a] hover:border-[#444]'
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
            <p className="text-sm text-[#777]">
              {filename
                ? <><span className="text-[#f0ede8]">{filename}</span> — andere Datei wählen</>
                : <><span className="text-[#f0ede8] font-medium">DATEV-CSV hier ablegen</span><br/>oder klicken zum Auswählen</>
              }
            </p>
          </div>

          {result && (
            <>
              {/* Header Info */}
              <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-3 text-xs text-[#666] flex flex-wrap gap-x-5 gap-y-1 font-mono">
                <span><span className="text-[#aaa]">{result.header.bezeichnung || '—'}</span></span>
                <span>Berater <b className="text-[#f0ede8]">{result.header.beraternr || '—'}</b></span>
                <span>Mandant <b className="text-[#f0ede8]">{result.header.mandantnr || '—'}</b></span>
                <span>Periode <b className="text-[#f0ede8]">{result.header.buchungsVon} → {result.header.buchungsBis}</b></span>
                <span>WKZ <b className="text-[#f0ede8]">{result.header.waehrung}</b></span>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Buchungen', value: result.stats.total,    color: 'text-[#d4e840]' },
                  { label: 'OK',        value: result.stats.oks,      color: 'text-[#00D4AA]' },
                  { label: 'Warnungen', value: result.stats.warnings, color: 'text-amber-400' },
                  { label: 'Fehler',    value: result.stats.errors,   color: result.stats.errors > 0 ? 'text-red-400' : 'text-[#00D4AA]' },
                ].map(c => (
                  <div key={c.label} className="bg-[#181818] border border-[#2a2a2a] rounded-xl p-3 text-center">
                    <p className={`text-xl font-semibold tabular-nums ${c.color}`}>{c.value}</p>
                    <p className="text-xs text-[#777] mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>

              {/* Checks */}
              <div>
                <p className="text-xs text-[#555] uppercase tracking-widest mb-2">Formatprüfung</p>
                <div className="space-y-1.5">
                  {result.checks.map((c, i) => (
                    <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-2.5 border text-sm ${
                      c.type === 'ok'   ? 'bg-[#00D4AA]/5 border-[#00D4AA]/20' :
                      c.type === 'warn' ? 'bg-amber-950/20 border-amber-900/30' :
                                          'bg-red-950/20 border-red-900/30'
                    }`}>
                      <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${
                        c.type === 'ok'   ? 'bg-[#00D4AA]/15 text-[#00D4AA]' :
                        c.type === 'warn' ? 'bg-amber-900/40 text-amber-400' :
                                            'bg-red-900/40 text-red-400'
                      }`}>
                        {c.type === 'ok' ? '✓ OK' : c.type === 'warn' ? '⚠ WARN' : '✕ FEHLER'}
                      </span>
                      <div>
                        <span className="text-[#f0ede8]">{c.title}</span>
                        {c.detail && <span className="text-[#777] ml-2 text-xs">{c.detail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Buchungen Tabelle */}
              <div>
                <p className="text-xs text-[#555] uppercase tracking-widest mb-2">Buchungszeilen</p>
                <div className="bg-[#181818] border border-[#2a2a2a] rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#2a2a2a] text-[#555] uppercase tracking-wider">
                          {['#', 'Belegfeld', 'Text', 'Konto', 'Gegenkonto', 'S/H', 'Betrag', 'Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.buchungen.map((b, i) => {
                          const betragOk = !isNaN(parseBetrag(b.betrag)) && parseBetrag(b.betrag) > 0
                          const shOk = b.sh === 'S' || b.sh === 'H'
                          const rowErr = !betragOk || !shOk
                          return (
                            <tr key={i} className="border-b border-[#1a1a1a] last:border-0 hover:bg-[#1a1a1a] transition-colors">
                              <td className="px-3 py-2 text-[#555]">{i + 1}</td>
                              <td className="px-3 py-2 text-[#aaa]">{b.belegfeld1 || '—'}</td>
                              <td className="px-3 py-2 text-[#aaa] max-w-[140px] truncate">{b.buchungstext || '—'}</td>
                              <td className="px-3 py-2">
                                <span className="text-[#f0ede8]">{b.konto}</span>
                                <br/><span className="text-[#555] font-sans">{getKontoName(b.konto, skr)}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-[#f0ede8]">{b.gegenkonto}</span>
                                <br/><span className="text-[#555] font-sans">{getKontoName(b.gegenkonto, skr)}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                  b.sh === 'S' ? 'bg-[#00D4AA]/15 text-[#00D4AA]' : 'bg-red-900/30 text-red-400'
                                }`}>{b.sh}</span>
                              </td>
                              <td className={`px-3 py-2 text-right ${betragOk ? 'text-[#d4e840]' : 'text-red-400'}`}>
                                {formatBetrag(b.betrag)}
                              </td>
                              <td className="px-3 py-2">
                                {rowErr
                                  ? <span className="text-red-400">⚠ prüfen</span>
                                  : <span className="text-[#00D4AA]">✓</span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Kontenübersicht */}
              <div>
                <p className="text-xs text-[#555] uppercase tracking-widest mb-2">Konten (Summen)</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(result.kontoSummen)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([konto, summe]) => (
                      <div key={konto} className="bg-[#181818] border border-[#2a2a2a] rounded-xl px-4 py-2.5 flex justify-between items-center">
                        <div>
                          <span className="font-mono text-sm text-[#f0ede8] font-semibold">{konto}</span>
                          <p className="text-xs text-[#666] mt-0.5">{getKontoName(konto, skr)}</p>
                        </div>
                        <span className="font-mono text-[#d4e840] font-semibold">
                          {summe.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Export Page ─────────────────────────────────────────────────────────
export default function ExportPage() {
  const router = useRouter()
  const [stats, setStats]             = useState<Stats | null>(null)
  const [statsLoading, setStatsLoad]  = useState(true)
  const [exportLoading, setExpLoad]   = useState(false)
  const [protokollLoad, setProtLoad]  = useState(false)
  const [checkerOpen, setCheckerOpen] = useState(false)

  const jetzt = new Date()
  const [vonDatum, setVon]            = useState(`${jetzt.getFullYear()}-${String(jetzt.getMonth()+1).padStart(2,'0')}-01`)
  const [bisDatum, setBis]            = useState(jetzt.toISOString().slice(0,10))
  const [skr, setSkr]                 = useState<'SKR03'|'SKR04'>('SKR03')
  const [festschreibung, setFest]     = useState(false)
  const [mitZahlungen, setZahlungen]  = useState(false)

  const zeitraeume = [
    { label: `${jetzt.getFullYear()} gesamt`, von: `${jetzt.getFullYear()}-01-01`, bis: `${jetzt.getFullYear()}-12-31` },
    { label: `${jetzt.getFullYear()-1}`,      von: `${jetzt.getFullYear()-1}-01-01`, bis: `${jetzt.getFullYear()-1}-12-31` },
    { label: 'Jan', von: `${jetzt.getFullYear()}-01-01`, bis: `${jetzt.getFullYear()}-01-31` },
    { label: 'Feb', von: `${jetzt.getFullYear()}-02-01`, bis: `${jetzt.getFullYear()}-02-28` },
    { label: 'Mär', von: `${jetzt.getFullYear()}-03-01`, bis: `${jetzt.getFullYear()}-03-31` },
    { label: 'Apr', von: `${jetzt.getFullYear()}-04-01`, bis: `${jetzt.getFullYear()}-04-30` },
    { label: 'Mai', von: `${jetzt.getFullYear()}-05-01`, bis: `${jetzt.getFullYear()}-05-31` },
    { label: 'Jun', von: `${jetzt.getFullYear()}-06-01`, bis: `${jetzt.getFullYear()}-06-30` },
    { label: 'Jul', von: `${jetzt.getFullYear()}-07-01`, bis: `${jetzt.getFullYear()}-07-31` },
    { label: 'Aug', von: `${jetzt.getFullYear()}-08-01`, bis: `${jetzt.getFullYear()}-08-31` },
    { label: 'Sep', von: `${jetzt.getFullYear()}-09-01`, bis: `${jetzt.getFullYear()}-09-30` },
    { label: 'Okt', von: `${jetzt.getFullYear()}-10-01`, bis: `${jetzt.getFullYear()}-10-31` },
    { label: 'Nov', von: `${jetzt.getFullYear()}-11-01`, bis: `${jetzt.getFullYear()}-11-30` },
    { label: 'Dez', von: `${jetzt.getFullYear()}-12-01`, bis: `${jetzt.getFullYear()}-12-31` },
    { label: 'Q1',  von: `${jetzt.getFullYear()}-01-01`, bis: `${jetzt.getFullYear()}-03-31` },
    { label: 'Q2',  von: `${jetzt.getFullYear()}-04-01`, bis: `${jetzt.getFullYear()}-06-30` },
    { label: 'Q3',  von: `${jetzt.getFullYear()}-07-01`, bis: `${jetzt.getFullYear()}-09-30` },
    { label: 'Q4',  von: `${jetzt.getFullYear()}-10-01`, bis: `${jetzt.getFullYear()}-12-31` },
  ]

  useEffect(() => { ladeStats() }, [vonDatum, bisDatum])

  const ladeStats = async () => {
    setStatsLoad(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const { data } = await (supabase as any)
      .from('dokumente')
      .select('netto,mwst,brutto,status,created_at')
      .eq('user_id', user.id)
      .in('typ', ['rechnung', 'bauvertrag'])
      .in('status', ['offen','bezahlt','ueberfaellig','angenommen'])
      .gte('created_at', vonDatum + 'T00:00:00')
      .lte('created_at', bisDatum + 'T23:59:59')

    if (data && data.length > 0) {
      setStats({
        anzahl:       data.length,
        sumNetto:     data.reduce((s: number, r: any) => s + Number(r.netto),  0),
        sumMwst:      data.reduce((s: number, r: any) => s + Number(r.mwst),   0),
        sumBrutto:    data.reduce((s: number, r: any) => s + Number(r.brutto), 0),
        bezahlt:      data.filter((r: any) => r.status === 'bezahlt').length,
        offen:        data.filter((r: any) => r.status === 'offen').length,
        ueberfaellig: data.filter((r: any) => r.status === 'ueberfaellig').length,
      })
    } else {
      setStats(null)
    }
    setStatsLoad(false)
  }

  const buildUrl = (extra = '') =>
    `/api/export/datev?von=${vonDatum}&bis=${bisDatum}&skr=${skr}&fest=${festschreibung?'1':'0'}&zahlungen=${mitZahlungen?'1':'0'}` + extra

  const exportieren = async () => {
    setExpLoad(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(buildUrl(), { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Export fehlgeschlagen'); return }
      const blob     = await res.blob()
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'datev.csv'
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = filename; a.click()
      URL.revokeObjectURL(a.href)
    } finally { setExpLoad(false) }
  }

  const protokollOeffnen = async () => {
    setProtLoad(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(buildUrl('&protokoll=1'), { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      if (!res.ok) { alert('Fehler'); return }
      const html = await res.text()
      window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank')
    } finally { setProtLoad(false) }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">

      {checkerOpen && <DatevCheckerModal onClose={() => setCheckerOpen(false)} skr={skr} />}

      {/* Top Bar — grüner Akzent */}
      <div className="border-b border-[#00D4AA]/15 px-6 py-4 flex items-center gap-3">
        <Link href="/dokumente" className="text-[#666] hover:text-[#aaa] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <h1 className="text-lg font-medium">DATEV Export</h1>
        <span className="text-xs bg-[#00D4AA]/15 text-[#00D4AA] px-2.5 py-1 rounded-full font-medium">
          Buchungsstapel Ascii v700
        </span>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ─── Zeitraum ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <p className="text-xs text-[#555] uppercase tracking-widest mb-4">Zeitraum</p>
          <div className="mb-4">
            <p className="text-xs text-[#666] mb-2">Monat wählen</p>
            <div className="flex gap-1.5 flex-wrap">
              {zeitraeume.slice(2, 14).map(z => (
                <button key={z.label} type="button"
                  onClick={() => { setVon(z.von); setBis(z.bis) }}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                    vonDatum === z.von && bisDatum === z.bis
                      ? 'bg-[#00D4AA] text-black font-bold'
                      : 'bg-[#111] border border-[#2a2a2a] text-[#999] hover:border-[#444] hover:text-[#ccc]'
                  }`}>{z.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap mb-5">
            {[...zeitraeume.slice(0,2), ...zeitraeume.slice(14)].map(z => (
              <button key={z.label} type="button"
                onClick={() => { setVon(z.von); setBis(z.bis) }}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                  vonDatum === z.von && bisDatum === z.bis
                    ? 'bg-[#00D4AA] text-black font-bold'
                    : 'bg-[#111] border border-[#2a2a2a] text-[#999] hover:border-[#444] hover:text-[#ccc]'
                }`}>{z.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#777] mb-1.5 block">Von</label>
              <input type="date" value={vonDatum} onChange={e => setVon(e.target.value)}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:outline-none focus:border-[#00D4AA] transition-colors [color-scheme:dark]"/>
            </div>
            <div>
              <label className="text-xs text-[#777] mb-1.5 block">Bis</label>
              <input type="date" value={bisDatum} onChange={e => setBis(e.target.value)}
                className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:outline-none focus:border-[#00D4AA] transition-colors [color-scheme:dark]"/>
            </div>
          </div>
        </div>

        {/* ─── DATEV-Einstellungen ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <p className="text-xs text-[#555] uppercase tracking-widest mb-4">Einstellungen</p>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2 text-[#ddd]">Kontenrahmen</p>
              <div className="grid grid-cols-2 gap-2">
                {(['SKR03','SKR04'] as const).map(k => (
                  <button key={k} type="button" onClick={() => setSkr(k)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      skr === k
                        ? 'border-[#d4e840] bg-[#d4e840]/8'
                        : 'border-[#2a2a2a] bg-[#111] hover:border-[#444]'
                    }`}>
                    <p className={`font-medium text-sm ${skr === k ? 'text-[#d4e840]' : 'text-[#ddd]'}`}>{k}</p>
                    {/* Subtext deutlich heller */}
                    <p className="text-xs text-[#888] mt-0.5 leading-relaxed">
                      {k === 'SKR03'
                        ? 'Forderungen 1400 · Erlöse 8400/8300 · Standard Handwerk'
                        : 'Forderungen 1200 · Erlöse 4400/4300 · Industrie/GmbH'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#444] transition-all">
              <input type="checkbox" checked={mitZahlungen} onChange={e => setZahlungen(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#00D4AA]"/>
              <div>
                <p className="text-sm font-medium text-[#ddd]">Zahlungseingänge einschließen</p>
                {/* Subtext heller */}
                <p className="text-xs text-[#888] mt-0.5 leading-relaxed">
                  Erzeugt zusätzliche Buchungssätze für bezahlte Rechnungen ({skr === 'SKR03' ? '1200' : '1800'} Bank an {skr === 'SKR03' ? '1400' : '1200'} Forderungen). Empfohlen für vollständige OPOS-Abstimmung.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-[#111] border border-[#2a2a2a] hover:border-[#444] transition-all">
              <input type="checkbox" checked={festschreibung} onChange={e => setFest(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#00D4AA]"/>
              <div>
                <p className="text-sm font-medium text-[#ddd]">Festschreibung aktivieren</p>
                {/* Subtext heller */}
                <p className="text-xs text-[#888] mt-0.5 leading-relaxed">
                  Setzt Feld 21 im Vorlaufsatz auf "1". Buchungen werden nach dem Import in DATEV gesperrt und können nicht mehr verändert werden. Nur für DATEV Unternehmen online / bei abgestimmten Perioden setzen.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* ─── Vorschau ─── */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <p className="text-xs text-[#555] uppercase tracking-widest mb-4">Vorschau</p>
          {statsLoading ? (
            <div className="flex items-center gap-3 text-[#777] text-sm py-4">
              <div className="w-4 h-4 border-2 border-[#444] border-t-transparent rounded-full animate-spin"/>
              Lade Daten...
            </div>
          ) : !stats ? (
            <div className="text-center py-8">
              <p className="text-[#666] text-sm">Keine Rechnungen im gewählten Zeitraum</p>
              <p className="text-xs text-[#444] mt-1">Nur gesendete Rechnungen werden exportiert (keine Entwürfe)</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/*
                Desktop: 3 Spalten nebeneinander
                Mobile: 3 Reihen (je 1 Card pro Zeile)
              */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#111] rounded-xl p-4 flex sm:flex-col items-center sm:items-center justify-between sm:justify-center">
                  <p className="text-xs text-[#777] sm:mb-1 sm:order-last sm:mt-1">Buchungen</p>
                  <p className="text-2xl font-semibold tabular-nums">{stats.anzahl}</p>
                </div>
                <div className="bg-[#111] rounded-xl p-4 flex sm:flex-col items-center sm:items-center justify-between sm:justify-center">
                  <p className="text-xs text-[#777] sm:mb-1 sm:order-last sm:mt-1">Netto</p>
                  <p className="text-2xl font-semibold tabular-nums text-[#aaa]">
                    {stats.sumNetto.toLocaleString('de-DE',{minimumFractionDigits:2})} €
                  </p>
                </div>
                <div className="bg-[#111] rounded-xl p-4 flex sm:flex-col items-center sm:items-center justify-between sm:justify-center">
                  <p className="text-xs text-[#777] sm:mb-1 sm:order-last sm:mt-1">Brutto</p>
                  <p className="text-2xl font-semibold tabular-nums text-[#00D4AA]">
                    {stats.sumBrutto.toLocaleString('de-DE',{minimumFractionDigits:2})} €
                  </p>
                </div>
              </div>

              <div className="flex gap-3 text-xs flex-wrap">
                <span className="text-[#00D4AA]">{stats.bezahlt} bezahlt</span>
                <span className="text-[#444]">·</span>
                <span className="text-[#d4e840]">{stats.offen} offen</span>
                {stats.ueberfaellig > 0 && (
                  <><span className="text-[#444]">·</span><span className="text-red-400">{stats.ueberfaellig} überfällig</span></>
                )}
                {mitZahlungen && stats.bezahlt > 0 && (
                  <><span className="text-[#444]">·</span><span className="text-[#777]">{stats.bezahlt} Zahlungseingänge erzeugt</span></>
                )}
              </div>

              <div className="bg-[#00D4AA]/5 border border-[#00D4AA]/15 rounded-xl p-4 text-xs text-[#999] leading-relaxed">
                <p className="text-[#00D4AA] font-medium mb-1">Export-Info</p>
                Kontenrahmen {skr} · Ausgangsrechnungen: {skr === 'SKR03' ? '1400' : '1200'} an {skr === 'SKR03' ? '8400' : '4400'} · Buchungszeitraum wird automatisch aus den tatsächlichen Belegdaten gesetzt{festschreibung ? ' · Festschreibung aktiv' : ''}{mitZahlungen ? ` · ${stats.bezahlt} Zahlungsbuchungen` : ''}
              </div>
            </div>
          )}
        </div>

        {/* ─── Aktionen ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button type="button" onClick={protokollOeffnen}
            disabled={protokollLoad || !stats || stats.anzahl === 0}
            className="py-3.5 rounded-xl border border-[#2a2a2a] bg-[#181818] text-sm font-medium text-[#999] hover:text-[#f0ede8] hover:border-[#444] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round"/>
            </svg>
            {protokollLoad ? 'Erstelle Protokoll...' : 'Übergabeprotokoll öffnen'}
          </button>

          <button type="button" onClick={exportieren}
            disabled={exportLoading || !stats || stats.anzahl === 0}
            className="py-3.5 rounded-xl bg-[#d4e840] text-black font-bold hover:opacity-90 active:scale-[0.98] disabled:opacity-40 transition-all flex items-center justify-center gap-2 text-sm">
            {exportLoading ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Wird erstellt...</>
            ) : (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" strokeLinecap="round"/></svg>
              DATEV CSV herunterladen{stats ? ` (${stats.anzahl})` : ''}</>
            )}
          </button>
        </div>

        {/* ─── CSV Checker Button ─── */}
        <button
          type="button"
          onClick={() => setCheckerOpen(true)}
          className="w-full py-3.5 rounded-xl border border-[#00D4AA]/20 bg-[#00D4AA]/5 text-sm font-medium text-[#00D4AA]/70 hover:text-[#00D4AA] hover:border-[#00D4AA]/40 transition-all flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round"/>
          </svg>
          Exportierte CSV prüfen
        </button>

        <p className="text-xs text-[#444] text-center pb-4">
          Entwürfe werden nicht exportiert · Dateiname: DATEV_[Mandant]_[JJJJMM].csv
        </p>
      </div>
    </div>
  )
}
'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface StripeStatus {
  verbunden: boolean; aktiv: boolean
  account_id?: string; charges_enabled?: boolean
  details_submitted?: boolean; email?: string; verbunden_am?: string
}

function ZahlungenInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus]         = useState<StripeStatus | null>(null)
  const [loading, setLoading]       = useState(true)
  const [stripeLoad, setStripeLoad] = useState(false)
  const [banner, setBanner]         = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { loadStatus() }, [])

  useEffect(() => {
    if (!searchParams) return
    if (searchParams.get('stripe') === 'verbunden') {
      setBanner({ msg: '✓ Stripe verbunden! Deine Rechnungen haben jetzt einen Zahlungslink.', ok: true })
      setTimeout(() => setBanner(null), 6000)
    }
    if (searchParams.get('stripe') === 'refresh') {
      setBanner({ msg: 'Bitte schließe das Onboarding ab.', ok: false })
      setTimeout(() => setBanner(null), 4000)
    }
  }, [searchParams])

  const loadStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/auth'); return }
    try {
      const res = await fetch('/api/connect/stripe?action=status', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      setStatus(await res.json())
    } catch { setStatus({ verbunden: false, aktiv: false }) }
    setLoading(false)
  }

  const verbinden = async () => {
    setStripeLoad(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/connect/stripe?action=connect', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const { url, error } = await res.json()
    if (error) { alert(error); setStripeLoad(false); return }
    window.location.href = url
  }

  const trennen = async () => {
    if (!confirm('Stripe-Verbindung trennen? Bestehende Zahlungslinks auf Rechnungen funktionieren dann nicht mehr.')) return
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/connect/stripe?action=disconnect', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    setStatus({ verbunden: false, aktiv: false })
    setBanner({ msg: 'Stripe getrennt.', ok: false })
    setTimeout(() => setBanner(null), 3000)
  }

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8]">
      <div className="border-b border-[#1a1a1a] px-6 py-4 flex items-center gap-3">
        <Link href="/profil" className="text-[#555] hover:text-[#888] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-medium">Zahlungen</h1>
          <p className="text-xs text-[#555]">Lass Kunden direkt auf Rechnungen bezahlen</p>
        </div>
      </div>

      {banner && (
        <div className={`px-6 py-3 text-sm text-center border-b ${banner.ok ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-[#2a2a2a] text-[#888] border-[#333]'}`}>
          {banner.msg}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">

        {/* Erklärung */}
        <div className="bg-[#d4e840]/5 border border-[#d4e840]/20 rounded-2xl p-5">
          <p className="text-sm font-medium text-[#d4e840] mb-2">Wie funktioniert das?</p>
          <div className="space-y-2 text-sm text-[#888] leading-relaxed">
            <p>Verbinde deinen Stripe-Account einmalig. Ab dann passiert folgendes automatisch:</p>
            <div className="space-y-1.5 mt-2">
              {[
                'Rechnung per E-Mail senden → Zahlungslink + QR-Code erscheinen automatisch',
                'Kunde öffnet E-Mail, klickt auf Link oder scannt QR-Code',
                'Zahlt per Kreditkarte, SEPA oder Apple/Google Pay',
                'Geld landet direkt auf deinem Konto',
                'Rechnung wird automatisch auf "Bezahlt" gesetzt',
                'Du bekommst eine Benachrichtigung in Werkwort',
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="text-[#d4e840] font-medium flex-shrink-0 text-xs mt-0.5">{i+1}.</span>
                  <span className="text-xs">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stripe Card */}
        <div className="bg-[#181818] border border-[#2a2a2a] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#635bff]/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#635bff">
                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                </svg>
              </div>
              <div>
                <p className="font-medium">Stripe</p>
                <p className="text-xs text-[#555]">Kreditkarte · SEPA · Apple Pay · Google Pay</p>
              </div>
            </div>
            {status?.verbunden && (
              <span className={`text-xs px-2.5 py-1 rounded-full ${status.aktiv ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                {status.aktiv ? '● Aktiv' : '● Onboarding ausstehend'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="h-12 bg-[#111] rounded-xl animate-pulse"/>
          ) : status?.verbunden ? (
            <div className="space-y-4">
              <div className="bg-[#111] rounded-xl p-4 space-y-2.5 text-sm">
                {status.email && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#555]">Stripe-Account</span>
                    <span className="text-[#888]">{status.email}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-[#555]">Zahlungen möglich</span>
                  <span className={status.charges_enabled ? 'text-green-400' : 'text-yellow-400'}>
                    {status.charges_enabled ? '✓ Ja' : '✗ Onboarding abschließen'}
                  </span>
                </div>
                {status.verbunden_am && (
                  <div className="flex justify-between items-center">
                    <span className="text-[#555]">Verbunden seit</span>
                    <span className="text-[#555]">{new Date(status.verbunden_am).toLocaleDateString('de-DE')}</span>
                  </div>
                )}
              </div>

              {!status.aktiv && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-sm text-yellow-400">
                  Das Onboarding ist noch nicht abgeschlossen — trage deine Bankdaten bei Stripe ein damit Zahlungen möglich sind.
                </div>
              )}

              <div className="flex gap-3">
                {!status.aktiv && (
                  <button type="button" onClick={verbinden} disabled={stripeLoad}
                    className="flex-1 py-3 bg-[#635bff] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all">
                    Onboarding abschließen
                  </button>
                )}
                <button type="button" onClick={trennen}
                  className="px-5 py-3 border border-red-500/20 text-red-500/60 text-sm rounded-xl hover:text-red-400 hover:border-red-500/40 transition-all">
                  Trennen
                </button>
              </div>

              {status.aktiv && (
                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 text-sm text-green-400">
                  ✓ Alles eingerichtet — neue Rechnungen enthalten automatisch einen Zahlungslink und QR-Code.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Gebühren */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {[
                  ['1,5 %', '+ 0,25 €', 'EU-Karten'],
                  ['0,35 %', '+ 0,35 €', 'SEPA-Lastschrift'],
                  ['0 %', 'für dich', 'Werkwort-Gebühr'],
                ].map(([a, b, c]) => (
                  <div key={c} className="bg-[#111] rounded-xl p-3 border border-[#2a2a2a]">
                    <p className="font-semibold text-[#f0ede8] text-sm mb-0.5">{a}</p>
                    <p className="text-[#555]">{b}</p>
                    <p className="text-[#333] mt-1">{c}</p>
                  </div>
                ))}
              </div>

              <button type="button" onClick={verbinden} disabled={stripeLoad}
                className="w-full py-3.5 bg-[#635bff] text-white text-sm font-medium rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                {stripeLoad
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Weiterleitung zu Stripe...</>
                  : <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" strokeLinecap="round"/></svg>
                      Stripe-Account verbinden
                    </>}
              </button>

              <p className="text-xs text-[#333] text-center">
                Kein Stripe-Account? Wird beim Verbinden kostenlos angelegt.
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-[#333] text-center pb-4">
          Werkwort nimmt keine Provision · Gebühren direkt an Stripe · Du behältst 100 % deines Umsatzes
        </p>
      </div>
      <div className="h-8"/>
    </div>
  )
}

export default function ZahlungenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0c0c0c]"/>}>
      <ZahlungenInner/>
    </Suspense>
  )
}
'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { usePushNotifications } from '@/hooks/usePushNotifications'

interface Notification {
  id: string; typ: string; titel: string; text: string | null
  link: string | null; gelesen: boolean; created_at: string
}

const TYP_ICON: Record<string, string> = {
  zahlung_eingegangen: '💰',
  dokument_gesehen:    '👁',
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ungelesen, setUngelesen]         = useState(0)
  const [open, setOpen]                   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { status: pushStatus, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadNotifications = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    try {
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUngelesen(data.ungelesen || 0)
    } catch {}
  }

  const alleGelesen = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'alle_gelesen' }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, gelesen: true })))
    setUngelesen(0)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(prev => !prev); if (!open && ungelesen > 0) alleGelesen() }}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] transition-colors"
        title="Benachrichtigungen"
      >
        <svg
          className={`w-4 h-4 ${ungelesen > 0 ? 'text-[#00D4AA]' : 'text-[#555]'}`}
          fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
        >
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {ungelesen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none">
            {ungelesen > 9 ? '9+' : ungelesen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-10 w-80 bg-[#181818] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden z-50">

          {/* Header — grüner Hintergrund von Anfang an */}
          <div className="px-4 py-3 border-b border-[#00D4AA]/20 bg-[#00D4AA]/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#00D4AA]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {/* Schriftzug weiter rechts durch gap */}
              <p className="text-xs font-semibold text-[#00D4AA] uppercase tracking-widest">
                Benachrichtigungen
              </p>
            </div>
            {ungelesen > 0 && (
              <button
                type="button"
                onClick={alleGelesen}
                className="text-xs text-[#00D4AA]/70 hover:text-[#00D4AA] transition-colors"
              >
                Alle lesen
              </button>
            )}
          </div>

          {/* Push Banner — voller grüner Button */}
          {pushStatus === 'default' && (
            <div className="px-4 py-3 border-b border-[#222] bg-[#00D4AA]/6 flex items-center justify-between gap-3">
              <p className="text-xs text-[#bbb] leading-relaxed">
                Push-Benachrichtigungen auf diesem Gerät aktivieren?
              </p>
              <button
                type="button"
                onClick={subscribe}
                className="flex-shrink-0 text-xs px-3 py-1.5 bg-[#00D4AA] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#00c49c] active:scale-95 transition-all"
              >
                Aktivieren
              </button>
            </div>
          )}

          {/* Push blockiert */}
          {pushStatus === 'denied' && (
            <div className="px-4 py-3 border-b border-[#222] bg-[#00D4AA]/4">
              <p className="text-xs text-[#999] leading-relaxed">
                Push blockiert — in den Browser-Einstellungen erlauben.
              </p>
            </div>
          )}

          {/* Push aktiv */}
          {pushStatus === 'granted' && (
            <div className="px-4 py-2.5 border-b border-[#222] bg-[#00D4AA]/4 flex items-center justify-between">
              <p className="text-xs text-[#00D4AA]/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full inline-block"/>
                Push aktiv
              </p>
              <button
                type="button"
                onClick={unsubscribe}
                className="text-xs text-[#777] hover:text-[#aaa] transition-colors"
              >
                Deaktivieren
              </button>
            </div>
          )}

          {/* Notifications Liste */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#888]">
                Keine Benachrichtigungen
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`border-b border-[#1f1f1f] last:border-0 transition-colors ${
                    !n.gelesen ? 'bg-[#00D4AA]/5 hover:bg-[#00D4AA]/8' : 'hover:bg-[#1a1a1a]'
                  }`}
                >
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                        <div className="min-w-0 flex-1">
                          {/* Titel: weiß wenn ungelesen, helles Grau wenn gelesen */}
                          <p className={`text-sm font-medium truncate ${!n.gelesen ? 'text-white' : 'text-[#999]'}`}>
                            {n.titel}
                          </p>
                          {/* Subtext: deutlich heller als vorher */}
                          {n.text && (
                            <p className={`text-xs mt-0.5 leading-relaxed ${!n.gelesen ? 'text-[#aaa]' : 'text-[#666]'}`}>
                              {n.text}
                            </p>
                          )}
                          {/* Datum: sichtbar */}
                          <p className={`text-xs mt-1 ${!n.gelesen ? 'text-[#777]' : 'text-[#555]'}`}>
                            {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {!n.gelesen && (
                          <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full flex-shrink-0 mt-1.5"/>
                        )}
                      </div>
                    </Link>
                  ) : (
                    <div className="px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${!n.gelesen ? 'text-white' : 'text-[#999]'}`}>
                            {n.titel}
                          </p>
                          {n.text && (
                            <p className={`text-xs mt-0.5 ${!n.gelesen ? 'text-[#aaa]' : 'text-[#666]'}`}>
                              {n.text}
                            </p>
                          )}
                          <p className={`text-xs mt-1 ${!n.gelesen ? 'text-[#777]' : 'text-[#555]'}`}>
                            {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
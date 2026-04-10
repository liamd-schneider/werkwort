'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Notification {
  id: string; typ: string; titel: string; text: string | null
  link: string | null; gelesen: boolean; created_at: string
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ungelesen, setUngelesen]         = useState(0)
  const [open, setOpen]                   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNotifications()
    // Alle 30 Sekunden aktualisieren
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  // Außerhalb klicken → schließen
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

  const TYP_ICON: Record<string, string> = {
    zahlung_eingegangen: '💰',
    dokument_gesehen:    '👁',
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(prev => !prev); if (!open && ungelesen > 0) alleGelesen() }}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#1a1a1a] transition-colors"
        title="Benachrichtigungen">
        <svg className="w-4 h-4 text-[#555]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {ungelesen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none">
            {ungelesen > 9 ? '9+' : ungelesen}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 bottom-10 w-72 bg-[#181818] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
            <p className="text-xs font-medium text-[#888] uppercase tracking-wider">Benachrichtigungen</p>
            {ungelesen > 0 && (
              <button type="button" onClick={alleGelesen} className="text-xs text-[#d4e840] hover:opacity-75">
                Alle gelesen
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#444]">
                Keine Benachrichtigungen
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id}
                  className={`px-4 py-3 border-b border-[#1f1f1f] last:border-0 ${!n.gelesen ? 'bg-[#1f1f1f]' : ''}`}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => setOpen(false)} className="block hover:opacity-80 transition-opacity">
                      <div className="flex items-start gap-2.5">
                        <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#f0ede8] truncate">{n.titel}</p>
                          {n.text && <p className="text-xs text-[#555] mt-0.5 leading-relaxed">{n.text}</p>}
                          <p className="text-xs text-[#333] mt-1">
                            {new Date(n.created_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                          </p>
                        </div>
                        {!n.gelesen && <div className="w-1.5 h-1.5 bg-[#d4e840] rounded-full flex-shrink-0 mt-1.5"/>}
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-start gap-2.5">
                      <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#f0ede8]">{n.titel}</p>
                        {n.text && <p className="text-xs text-[#555] mt-0.5">{n.text}</p>}
                        <p className="text-xs text-[#333] mt-1">
                          {new Date(n.created_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                        </p>
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
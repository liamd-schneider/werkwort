'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { usePushNotifications } from '@/hooks/usePushNotifications'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Notification {
  id: string; typ: string; titel: string; text: string | null
  link: string | null; gelesen: boolean; created_at: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const NAV = [
  { href: '/dashboard',   label: 'Home',      icon: 'M3 12L12 4l9 8M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9' },
  { href: '/dokumente',   label: 'Dokumente', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2' },
  { href: '/projekte',    label: 'Projekte',  icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { href: '/bautagebuch', label: 'Tagebuch',  icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/profil',      label: 'Profil',    icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  { href: '/neu',         label: 'Neu',       icon: 'M12 4v16m8-8H4', accent: true },
]

const TOOLS = [
  { href: '/kalender',  label: 'Kalender',    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/export',    label: 'DATEV Export', icon: 'M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2' },
  { href: '/zahlungen', label: 'Zahlungen',   icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { href: '/lexware',   label: 'Lexware',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 12h6m-6 4h4' },
]

const TYP_ICON: Record<string, string> = {
  zahlung_eingegangen: '💰',
  dokument_gesehen:    '👁',
}

// ─── Desktop NotificationBell (floating dropdown, desktop only) ───────────────

function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ungelesen, setUngelesen]         = useState(0)
  const [open, setOpen]                   = useState(false)
  const { status: pushStatus, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
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
    <div className="relative">
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
          {pushStatus === 'default' && (
            <div className="px-4 py-3 border-b border-[#2a2a2a] bg-[#1a1a1a] flex items-center justify-between gap-3">
              <p className="text-xs text-[#666] leading-relaxed">Push-Benachrichtigungen aktivieren?</p>
              <button type="button" onClick={subscribe}
                className="flex-shrink-0 text-xs px-2.5 py-1.5 bg-[#d4e840] text-[#0c0c0c] font-medium rounded-lg hover:opacity-90">
                Aktivieren
              </button>
            </div>
          )}
          {pushStatus === 'denied' && (
            <div className="px-4 py-3 border-b border-[#2a2a2a] bg-[#1a1a1a]">
              <p className="text-xs text-[#444]">Push blockiert — in den Browser-Einstellungen erlauben.</p>
            </div>
          )}
          {pushStatus === 'granted' && (
            <div className="px-4 py-2.5 border-b border-[#2a2a2a] flex items-center justify-between">
              <p className="text-xs text-[#333] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"/>Push aktiv
              </p>
              <button type="button" onClick={unsubscribe} className="text-xs text-[#333] hover:text-[#555]">Deaktivieren</button>
            </div>
          )}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#444]">Keine Benachrichtigungen</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 border-b border-[#1f1f1f] last:border-0 ${!n.gelesen ? 'bg-[#1f1f1f]' : ''}`}>
                  {n.link ? (
                    <Link href={n.link} className="block hover:opacity-80">
                      <div className="flex items-start gap-2.5">
                        <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#f0ede8] truncate">{n.titel}</p>
                          {n.text && <p className="text-xs text-[#555] mt-0.5">{n.text}</p>}
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

// ─── Mobile: inline accordion notifications ───────────────────────────────────
// Kein Dropdown, kein z-index Problem — klappt direkt im Sheet auf.

function MobileNotifications({ onNavigate }: { onNavigate: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ungelesen, setUngelesen]         = useState(0)
  const [expanded, setExpanded]           = useState(false)
  const [loaded, setLoaded]               = useState(false)
  const { status: pushStatus, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
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
      setLoaded(true)
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

  const handleToggle = () => {
    if (!expanded && ungelesen > 0) alleGelesen()
    setExpanded(prev => !prev)
  }

  return (
    <div className="mb-4">
      {/* Header row — tap to expand */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-1 py-2 rounded-xl transition-colors active:bg-[#1a1a1a]">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 bg-[#111] border border-[#1a1a1a] rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[#555]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {ungelesen > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none">
                {ungelesen > 9 ? '9+' : ungelesen}
              </span>
            )}
          </div>
          <span className="text-sm text-[#888]">Benachrichtigungen</span>
          {ungelesen > 0 && (
            <span className="text-xs font-medium text-[#d4e840]">{ungelesen} neu</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-[#333] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Expandable list — renders inline, no overflow clipping */}
      {expanded && (
        <div className="mt-1 rounded-2xl border border-[#1a1a1a] overflow-hidden">
          {pushStatus === 'default' && (
            <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#111] flex items-center justify-between gap-3">
              <p className="text-xs text-[#555] leading-relaxed">Push-Benachrichtigungen aktivieren?</p>
              <button type="button" onClick={subscribe}
                className="flex-shrink-0 text-xs px-3 py-1.5 bg-[#d4e840] text-[#0c0c0c] font-medium rounded-lg">
                Aktivieren
              </button>
            </div>
          )}
          {pushStatus === 'denied' && (
            <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#111]">
              <p className="text-xs text-[#333]">Push blockiert — in Browser-Einstellungen erlauben.</p>
            </div>
          )}
          {pushStatus === 'granted' && (
            <div className="px-4 py-2.5 border-b border-[#1a1a1a] flex items-center justify-between">
              <p className="text-xs text-[#333] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"/>Push aktiv
              </p>
              <button type="button" onClick={unsubscribe} className="text-xs text-[#333]">Deaktivieren</button>
            </div>
          )}

          {!loaded ? (
            <div className="px-4 py-6 text-center text-sm text-[#333]">Lädt…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#333]">Keine Benachrichtigungen</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`border-b border-[#1a1a1a] last:border-0 ${!n.gelesen ? 'bg-[#131313]' : 'bg-[#0f0f0f]'}`}>
                {n.link ? (
                  <Link href={n.link} onClick={onNavigate} className="flex items-start gap-3 px-4 py-3 active:opacity-70">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#f0ede8] truncate">{n.titel}</p>
                      {n.text && <p className="text-xs text-[#555] mt-0.5 leading-relaxed">{n.text}</p>}
                      <p className="text-xs text-[#333] mt-1">
                        {new Date(n.created_at).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </div>
                    {!n.gelesen && <div className="w-1.5 h-1.5 bg-[#d4e840] rounded-full flex-shrink-0 mt-2"/>}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
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
      )}
    </div>
  )
}

// ─── FAB — zeigt auch ungelesene Badge wenn Sheet zu ist ─────────────────────

function FABWithBadge({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [ungelesen, setUngelesen] = useState(0)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      try {
        const res = await fetch('/api/notifications', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        })
        const data = await res.json()
        setUngelesen(data.ungelesen || 0)
      } catch {}
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { if (open) setUngelesen(0) }, [open])

  return (
    <button
      onClick={onToggle}
      className="fixed z-50 rounded-2xl bg-[#d4e840] flex items-center justify-center transition-all duration-200 active:scale-95"
      style={{ width: '52px', height: '52px', bottom: 'calc(1.5rem + env(safe-area-inset-bottom))', right: '1.25rem' }}
      aria-label="Navigation öffnen">
      {open
        ? <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/></svg>
      }
      {!open && ungelesen > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white leading-none border-2 border-[#0c0c0c]">
          {ungelesen > 9 ? '9+' : ungelesen}
        </span>
      )}
    </button>
  )
}

// ─── BottomNav ────────────────────────────────────────────────────────────────

export function BottomNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (pathname === '/auth') return null

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-[200px] z-50 bg-[#0d0d0d] border-r border-[#1a1a1a] flex-col">
        <div className="px-5 py-5 border-b border-[#1a1a1a]">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#d4e840] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-black font-bold text-xs">W</span>
            </div>
            <span className="text-sm font-light text-[#f0ede8]">
              werk<span className="font-bold text-[#d4e840]">wort</span>
            </span>
          </Link>
        </div>

        <div className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                  item.accent ? 'bg-[#d4e840] hover:opacity-90'
                  : active    ? 'bg-[#1a1a1a]'
                              : 'hover:bg-[#151515]'
                }`}>
                <svg style={{ width: '18px', height: '18px', flexShrink: 0 }}
                  className={item.accent ? 'text-black' : active ? 'text-[#d4e840]' : 'text-[#555] group-hover:text-[#888]'}
                  fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={`text-sm ${item.accent ? 'text-black font-medium' : active ? 'text-[#f0ede8] font-medium' : 'text-[#555] group-hover:text-[#888]'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          <div className="border-t border-[#1a1a1a] mt-3 pt-3">
            <p className="text-xs text-[#2a2a2a] px-3 mb-2 uppercase tracking-wider">Tools</p>
            {TOOLS.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${active ? 'bg-[#1a1a1a]' : 'hover:bg-[#151515]'}`}>
                  <svg style={{ width: '18px', height: '18px', flexShrink: 0 }}
                    className={active ? 'text-[#d4e840]' : 'text-[#555] group-hover:text-[#888]'}
                    fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className={`text-sm ${active ? 'text-[#f0ede8] font-medium' : 'text-[#555] group-hover:text-[#888]'}`}>
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        <div className="px-3 py-4 border-t border-[#1a1a1a]">
          <div className="flex items-center justify-between px-3">
            <p className="text-xs text-[#2a2a2a]">Werkwort Beta</p>
            <NotificationBell/>
          </div>
        </div>
      </nav>

      {/* ── Mobile: FAB + Sheet ── */}
      <div className="md:hidden">
        {/* Overlay */}
        <div onClick={() => setOpen(false)}
          className={`fixed inset-0 z-40 transition-all duration-300 ${open ? 'bg-black/60 pointer-events-auto' : 'bg-transparent pointer-events-none'}`}/>

        {/* Sheet */}
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-2xl border-t border-[#1e1e1e] rounded-t-3xl transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${open ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="w-9 h-1 bg-[#1e1e1e] rounded-full mx-auto mt-3 mb-4"/>

          <div className="px-4 pb-28 overflow-y-auto max-h-[75vh]">

            {/* Notifications accordion — kein Dropdown, keine z-index Bugs */}
            <MobileNotifications onNavigate={() => setOpen(false)} />

            <p className="text-[10px] text-[#2a2a2a] uppercase tracking-widest px-1 mb-2">Navigation</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {NAV.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${
                      item.accent ? 'bg-[#161a00] border-[#2a3000]'
                      : active    ? 'bg-[#141414] border-[#1e1e1e]'
                                  : 'bg-[#111] border-[#1a1a1a] active:scale-95'
                    }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                      style={{ color: item.accent ? '#d4e840' : active ? '#d4e840' : '#444' }}>
                      <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={`text-[11px] ${item.accent ? 'text-[#d4e840] font-semibold' : active ? 'text-[#d4e840]' : 'text-[#555]'}`}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>

            <p className="text-[10px] text-[#2a2a2a] uppercase tracking-widest px-1 mb-2">Tools</p>
            <div className="grid grid-cols-3 gap-2">
              {TOOLS.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${active ? 'bg-[#141414] border-[#1e1e1e]' : 'bg-[#111] border-[#1a1a1a] active:scale-95'}`}>
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                      style={{ color: active ? '#d4e840' : '#444' }}>
                      <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={`text-[11px] ${active ? 'text-[#f0ede8]' : 'text-[#555]'}`}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        {/* FAB mit Badge */}
        <FABWithBadge open={open} onToggle={() => setOpen(prev => !prev)} />
      </div>
    </>
  )
}
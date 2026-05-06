'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
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

// ─── Desktop NotificationBell ─────────────────────────────────────────────────

function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ungelesen, setUngelesen]         = useState(0)
  const [open, setOpen]                   = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { status: pushStatus, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30_000)
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

  const ungelesene = notifications.filter(n => !n.gelesen)
  const gelesene   = notifications.filter(n => n.gelesen)

  return (
    <div ref={ref} className="relative px-3 py-2 border-b border-[#1a1a1a] ">
      {/* Bell als volle Nav-Zeile */}
      <button
        type="button"
        onClick={() => {
          setOpen(prev => !prev)
          if (!open && ungelesen > 0) alleGelesen()
        }}
        className={`w-full flex items-center bg-[#d4e840] gap-3 px-3 py-2.5 rounded-xl transition-all group ${
          open ? 'bg-[#d4e840]' : 'hover:bg-[#d4e840]'
        }`}
      >
        <div className="relative flex-shrink-0 ">
         
          {ungelesen > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white leading-none">
              {ungelesen > 9 ? '9+' : ungelesen}
            </span>
          )}
        </div>
        <span className={`text-sm text-black flex-1 text-left ${ungelesen > 0 || open ? 'text-black font-medium' : 'text-[#000] group-hover:text-black'}`}>
          Benachrichtigungen
        </span>
        {ungelesen > 0 && (
          <span className="text-[10px] font-bold bg-[#00D4AA]/15 text-[#00D4AA] px-1.5 py-0.5 rounded-full flex-shrink-0">
            {ungelesen}
          </span>
        )}
      </button>

      {/* Dropdown — öffnet nach rechts aus der Sidebar */}
      {open && (
        <div className="absolute left-[208px] top-0 w-80 bg-[#141414] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden z-50">

          {/* Header */}
          <div className="px-4 py-3 border-b border-[#222] flex items-center justify-between bg-[#00D4AA]/5">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#00D4AA]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p className="text-xs font-medium text-[#00D4AA] uppercase tracking-wider">Nachrichten</p>
            </div>
            {ungelesen > 0 && (
              <button type="button" onClick={alleGelesen} className="text-xs text-[#00D4AA]/70 hover:text-[#00D4AA] transition-colors">
                Alle lesen
              </button>
            )}
          </div>

          {/* Push Banner — voller grüner Button */}
          {pushStatus === 'default' && (
            <div className="px-4 py-3 border-b border-[#222] bg-[#161616] flex items-center justify-between gap-3">
              <p className="text-xs text-[#aaa] leading-relaxed">Push-Benachrichtigungen aktivieren?</p>
              <button
                type="button"
                onClick={subscribe}
                className="flex-shrink-0 text-xs px-3 py-1.5 bg-[#00D4AA] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#00c49c] active:scale-95 transition-all"
              >
                Aktivieren
              </button>
            </div>
          )}
          {pushStatus === 'denied' && (
            <div className="px-4 py-2.5 border-b border-[#222] bg-[#161616]">
              <p className="text-xs text-[#888]">Push blockiert — in Browser-Einstellungen erlauben.</p>
            </div>
          )}
          {pushStatus === 'granted' && (
            <div className="px-4 py-2 border-b border-[#222] flex items-center justify-between">
              <p className="text-xs text-[#00D4AA]/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full inline-block"/>
                Push aktiv
              </p>
              <button type="button" onClick={unsubscribe} className="text-xs text-[#777] hover:text-[#aaa] transition-colors">
                Deaktivieren
              </button>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-[#777]">
                Keine Benachrichtigungen
              </div>
            ) : (
              <>
                {/* Ungelesene prominent oben */}
                {ungelesene.length > 0 && (
                  <div>
                    <p className="text-[10px] text-[#00D4AA]/70 uppercase tracking-widest px-4 pt-3 pb-1.5">Neu</p>
                    {ungelesene.map(n => (
                      <NotifItem key={n.id} n={n} onClose={() => setOpen(false)} />
                    ))}
                  </div>
                )}
                {/* Gelesene darunter */}
                {gelesene.length > 0 && (
                  <div className={ungelesene.length > 0 ? 'border-t border-[#222] mt-1' : ''}>
                    {ungelesene.length > 0 && (
                      <p className="text-[10px] text-[#555] uppercase tracking-widest px-4 pt-3 pb-1.5">Früher</p>
                    )}
                    {gelesene.map(n => (
                      <NotifItem key={n.id} n={n} onClose={() => setOpen(false)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Einzelne Notification im Dropdown ───────────────────────────────────────

function NotifItem({ n, onClose }: { n: Notification; onClose: () => void }) {
  const content = (
    <div className="flex items-start gap-2.5">
      <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
      <div className="min-w-0 flex-1">
        {/* Titel: weiß wenn ungelesen, helles Grau wenn gelesen */}
        <p className={`text-sm font-medium truncate ${!n.gelesen ? 'text-white' : 'text-[#999]'}`}>
          {n.titel}
        </p>
        {/* Subtext: helles Grau */}
        {n.text && (
          <p className={`text-xs mt-0.5 leading-relaxed ${!n.gelesen ? 'text-[#aaa]' : 'text-[#b1b1b1]'}`}>
            {n.text}
          </p>
        )}
        {/* Datum: sichtbar hell */}
        <p className={`text-xs mt-1 ${!n.gelesen ? 'text-[#777]' : 'text-[#444]'}`}>
          {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {!n.gelesen && <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full flex-shrink-0 mt-1.5"/>}
    </div>
  )

  const cls = `px-4 py-3 border-b border-[#1e1e1e] last:border-0 transition-colors ${
    !n.gelesen ? 'bg-[#00D4AA]/4 hover:bg-[#00D4AA]/6' : 'hover:bg-[#1a1a1a]'
  }`

  return n.link ? (
    <Link href={n.link} onClick={onClose} className={`block ${cls}`}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  )
}

// ─── Mobile: inline accordion notifications ───────────────────────────────────

function MobileNotifications({ onNavigate }: { onNavigate: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [ungelesen, setUngelesen]         = useState(0)
  const [expanded, setExpanded]           = useState(false)
  const [loaded, setLoaded]               = useState(false)
  const { status: pushStatus, subscribe, unsubscribe } = usePushNotifications()

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30_000)
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
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-1 py-2 rounded-xl transition-colors active:bg-[#00D4AA]/5"
      >
        <div className="flex items-center gap-2.5">
          <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border transition-colors ${
            ungelesen > 0 ? 'bg-[#00D4AA]/10 border-[#00D4AA]/20' : 'bg-[#111] border-[#1a1a1a]'
          }`}>
            <svg
              className={`w-4 h-4 ${ungelesen > 0 ? 'text-[#00D4AA]' : 'text-[#888]'}`}
              fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
            >
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {ungelesen > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white leading-none">
                {ungelesen > 9 ? '9+' : ungelesen}
              </span>
            )}
          </div>
          <span className="text-sm text-[#ccc]">Benachrichtigungen</span>
          {ungelesen > 0 && (
            <span className="text-xs font-medium text-[#00D4AA]">{ungelesen} neu</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-[#777] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="mt-1 rounded-2xl border border-[#00D4AA]/15 bg-[#00D4AA]/4 overflow-hidden">

          {/* Push Banner — voller grüner Button */}
          {pushStatus === 'default' && (
            <div className="px-4 py-3 border-b border-[#00D4AA]/10 flex items-center justify-between gap-3">
              <p className="text-xs text-[#bbb] leading-relaxed">Push-Benachrichtigungen aktivieren?</p>
              <button
                type="button"
                onClick={subscribe}
                className="flex-shrink-0 text-xs px-3 py-1.5 bg-[#00D4AA] text-[#0a0a0a] font-bold rounded-lg hover:bg-[#00c49c] active:scale-95 transition-all"
              >
                Aktivieren
              </button>
            </div>
          )}
          {pushStatus === 'denied' && (
            <div className="px-4 py-3 border-b border-[#00D4AA]/10">
              <p className="text-xs text-[#999]">Push blockiert — in Browser-Einstellungen erlauben.</p>
            </div>
          )}
          {pushStatus === 'granted' && (
            <div className="px-4 py-2.5 border-b border-[#00D4AA]/10 flex items-center justify-between">
              <p className="text-xs text-[#00D4AA]/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full inline-block"/>
                Push aktiv
              </p>
              <button type="button" onClick={unsubscribe} className="text-xs text-[#777] hover:text-[#aaa] transition-colors">
                Deaktivieren
              </button>
            </div>
          )}

          {!loaded ? (
            <div className="px-4 py-6 text-center text-sm text-[#888]">Lädt…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#888]">Keine Benachrichtigungen</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`border-b border-[#00D4AA]/8 last:border-0 ${!n.gelesen ? 'bg-[#00D4AA]/6' : ''}`}
              >
                {n.link ? (
                  <Link href={n.link} onClick={onNavigate} className="flex items-start gap-3 px-4 py-3 active:opacity-70">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      {/* Titel heller */}
                      <p className={`text-sm font-medium truncate ${!n.gelesen ? 'text-white' : 'text-[#999]'}`}>
                        {n.titel}
                      </p>
                      {/* Subtext heller */}
                      {n.text && (
                        <p className={`text-xs mt-0.5 leading-relaxed ${!n.gelesen ? 'text-[#aaa]' : 'text-[#b1b1b1]'}`}>
                          {n.text}
                        </p>
                      )}
                      {/* Datum heller */}
                      <p className={`text-xs mt-1 ${!n.gelesen ? 'text-[#777]' : 'text-[#555]'}`}>
                        {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    {!n.gelesen && <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-full flex-shrink-0 mt-2"/>}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="text-base flex-shrink-0 mt-0.5">{TYP_ICON[n.typ] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${!n.gelesen ? 'text-white' : 'text-[#999]'}`}>
                        {n.titel}
                      </p>
                      {n.text && (
                        <p className={`text-xs mt-0.5 ${!n.gelesen ? 'text-[#aaa]' : 'text-[#b1b1b1]'}`}>
                          {n.text}
                        </p>
                      )}
                      <p className={`text-xs mt-1 ${!n.gelesen ? 'text-[#777]' : 'text-[#555]'}`}>
                        {new Date(n.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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

// ─── FAB ─────────────────────────────────────────────────────────────────────

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
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { if (open) setUngelesen(0) }, [open])

  return (
    <button
      onClick={onToggle}
      className="fixed z-50 rounded-2xl bg-[#d4e840] flex items-center justify-center transition-all duration-200 active:scale-95"
      style={{ width: '52px', height: '52px', bottom: 'calc(1.5rem + env(safe-area-inset-bottom))', right: '1.25rem' }}
      aria-label="Navigation öffnen"
    >
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

  if (pathname === '/' || pathname === '/auth') return null

  return (
    <>
      {/* ── Desktop Sidebar ── */}
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-[200px] z-50 bg-[#0d0d0d] border-r border-[#1a1a1a] flex-col">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-[#1a1a1a]">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#d4e840] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-black font-bold text-xs">e</span>
            </div>
            <span className="text-sm font-light text-[#f0ede8]">
  e<span className="font-bold text-[#d4e840]">Werk</span>wort
</span>
          </Link>
        </div>

        {/* Bell direkt unter Logo */}
        <NotificationBell />

        {/* Nav Links */}
        <div className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {NAV.map(item => {
            const active = pathname.startsWith(item.href)
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                  item.accent ? 'bg-[#d4e840] hover:opacity-90'
                  : active    ? 'bg-[#1a1a1a]'
                              : 'hover:bg-[#151515]'
                }`}
              >
                <svg style={{ width: '18px', height: '18px', flexShrink: 0 }}
                  className={item.accent ? 'text-black' : active ? 'text-[#d4e840]' : 'text-[#888] group-hover:text-[#bbb]'}
                  fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={`text-sm ${item.accent ? 'text-black font-medium' : active ? 'text-white font-medium' : 'text-[#888] group-hover:text-[#bbb]'}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          <div className="border-t border-[#1a1a1a] mt-3 pt-3">
            <p className="text-xs text-[#555] px-3 mb-2 uppercase tracking-wider">Tools</p>
            {TOOLS.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${active ? 'bg-[#1a1a1a]' : 'hover:bg-[#151515]'}`}
                >
                  <svg style={{ width: '18px', height: '18px', flexShrink: 0 }}
                    className={active ? 'text-[#d4e840]' : 'text-[#888] group-hover:text-[#bbb]'}
                    fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className={`text-sm ${active ? 'text-white font-medium' : 'text-[#888] group-hover:text-[#bbb]'}`}>
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#1a1a1a]">
          <p className="text-xs text-[#cecece]">eWerkwort Beta</p>
          <p className="text-xs text-[#cecece]"><a href="/admin" className="hover:underline">Admin</a></p>
        </div>
      </nav>

      {/* ── Mobile: FAB + Sheet ── */}
      <div className="md:hidden">
        <div
          onClick={() => setOpen(false)}
          className={`fixed inset-0 z-40 transition-all duration-300 ${open ? 'bg-black/60 pointer-events-auto' : 'bg-transparent pointer-events-none'}`}
        />

        <div
          className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-2xl border-t border-[#1e1e1e] rounded-t-3xl transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${open ? 'translate-y-0' : 'translate-y-full'}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="w-9 h-1 bg-[#1e1e1e] rounded-full mx-auto mt-3 mb-4"/>

          <div className="px-4 pb-28 overflow-y-auto max-h-[75vh]">
            <MobileNotifications onNavigate={() => setOpen(false)} />

            <p className="text-[10px] text-[#555] uppercase tracking-widest px-1 mb-2">Navigation</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {NAV.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${
                      item.accent ? 'bg-[#161a00] border-[#2a3000]'
                      : active    ? 'bg-[#141414] border-[#1e1e1e]'
                                  : 'bg-[#111] border-[#1a1a1a] active:scale-95'
                    }`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                      style={{ color: item.accent ? '#d4e840' : active ? '#d4e840' : '#888' }}>
                      <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={`text-[11px] ${item.accent ? 'text-[#d4e840] font-semibold' : active ? 'text-[#d4e840]' : 'text-[#aaa]'}`}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>

            <p className="text-[10px] text-[#555] uppercase tracking-widest px-1 mb-2">Tools</p>
            <div className="grid grid-cols-3 gap-2">
              {TOOLS.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${active ? 'bg-[#141414] border-[#1e1e1e]' : 'bg-[#111] border-[#1a1a1a] active:scale-95'}`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                      style={{ color: active ? '#d4e840' : '#888' }}>
                      <path d={item.icon} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className={`text-[11px] ${active ? 'text-white' : 'text-[#aaa]'}`}>
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>

        <FABWithBadge open={open} onToggle={() => setOpen(prev => !prev)} />
      </div>
    </>
  )
}
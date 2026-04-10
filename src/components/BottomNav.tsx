'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const NAV = [
  { href: '/dashboard',   label: 'Home',      icon: 'M3 12L12 4l9 8M5 10v9a1 1 0 001 1h4v-4h4v4h4a1 1 0 001-1v-9' },
  { href: '/dokumente',   label: 'Dokumente', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2' },
  { href: '/projekte',    label: 'Projekte',  icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { href: '/bautagebuch', label: 'Tagebuch',  icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/profil',      label: 'Profil',    icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z' },
  { href: '/neu',         label: 'Neu',       icon: 'M12 4v16m8-8H4', accent: true },
]

const TOOLS = [
  { href: '/kalender',  label: 'Kalender',        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { href: '/export',    label: 'DATEV Export',     icon: 'M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2' },
  { href: '/zahlungen', label: 'Zahlungsanbieter', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { href: '/lexware',   label: 'Lexware',          icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 12h6m-6 4h4' },
]

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
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                  item.accent
                    ? 'bg-[#d4e840] hover:opacity-90'
                    : active
                      ? 'bg-[#1a1a1a]'
                      : 'hover:bg-[#151515]'
                }`}
              >
                <svg
                  style={{ width: '18px', height: '18px', flexShrink: 0 }}
                  className={item.accent ? 'text-black' : active ? 'text-[#d4e840]' : 'text-[#555] group-hover:text-[#888]'}
                  fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                >
                  <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
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
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${active ? 'bg-[#1a1a1a]' : 'hover:bg-[#151515]'}`}
                >
                  <svg
                    style={{ width: '18px', height: '18px', flexShrink: 0 }}
                    className={active ? 'text-[#d4e840]' : 'text-[#555] group-hover:text-[#888]'}
                    fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"
                  >
                    <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
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
          <p className="text-xs text-[#2a2a2a] px-3">Werkwort Beta</p>
        </div>
      </nav>

      {/* ── Mobile: FAB + Sheet ── */}
      <div className="md:hidden">
        {/* Overlay */}
        <div
          onClick={() => setOpen(false)}
          className={`fixed inset-0 z-40 transition-all duration-300 ${
            open ? 'bg-black/60 pointer-events-auto' : 'bg-transparent pointer-events-none'
          }`}
        />

        {/* Sheet */}
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-2xl border-t border-[#1e1e1e] rounded-t-3xl transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="w-9 h-1 bg-[#1e1e1e] rounded-full mx-auto mt-3 mb-5" />

          <div className="px-4 pb-28">
            <p className="text-[10px] text-[#2a2a2a] uppercase tracking-widest px-1 mb-2">Navigation</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {NAV.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${
                      item.accent
                        ? 'bg-[#161a00] border-[#2a3000]'
                        : active
                          ? 'bg-[#141414] border-[#1e1e1e]'
                          : 'bg-[#111] border-[#1a1a1a] active:scale-95'
                    }`}
                  >
                    <svg
                      className="w-5 h-5" fill="none" stroke="currentColor"
                      strokeWidth={1.8} viewBox="0 0 24 24"
                      style={{ color: item.accent ? '#d4e840' : active ? '#d4e840' : '#444' }}
                    >
                      <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
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
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${
                      active ? 'bg-[#141414] border-[#1e1e1e]' : 'bg-[#111] border-[#1a1a1a] active:scale-95'
                    }`}
                  >
                    <svg
                      className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor"
                      strokeWidth={1.8} viewBox="0 0 24 24"
                      style={{ color: active ? '#d4e840' : '#444' }}
                    >
                      <path d={item.icon} strokeLinecap="round" strokeLinejoin="round" />
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

        {/* FAB */}
        <button
          onClick={() => setOpen(prev => !prev)}
          className="fixed z-50 rounded-2xl bg-[#d4e840] flex items-center justify-center transition-all duration-200 active:scale-95"
          style={{
            width: '52px',
            height: '52px',
            bottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
            right: '1.25rem',
          }}
          aria-label="Navigation öffnen"
        >
          {open ? (
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-black" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
    </>
  )
}
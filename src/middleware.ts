import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Zahlungs-Rückseiten immer erlauben
  if (pathname === '/zahlungen/danke' || pathname === '/zahlungen/fehler') {
    return NextResponse.next()
  }

  // Alle sb-* Cookies akzeptieren (egal welches Supabase-Format)
  const supabaseCookie = req.cookies.getAll().find(c => c.name.startsWith('sb-'))

  const isAuthPage  = pathname.startsWith('/auth')
  const isProtected = [
    '/dashboard', '/neu', '/dokumente', '/bautagebuch',
    '/profil', '/projekte', '/export', '/kalender', '/zahlungen', '/lexware',
  ].some(path => pathname.startsWith(path))

  if (!supabaseCookie && isProtected) {
    return NextResponse.redirect(new URL('/auth', req.url))
  }
  if (supabaseCookie && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*', '/neu/:path*', '/dokumente/:path*',
    '/bautagebuch/:path*', '/profil/:path*', '/projekte/:path*',
    '/export/:path*', '/kalender/:path*', '/zahlungen/:path*', '/lexware/:path*', '/auth/:path*',
  ],
}
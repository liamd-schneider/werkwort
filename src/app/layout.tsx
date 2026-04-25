import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { BottomNav } from '@/components/BottomNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'eWerkwort — Sprache wird Arbeit',
  description: 'KI-Dokumente für Handwerker. Angebote, Rechnungen, Bautagebuch per Sprache.',
}

export const viewport: Viewport = {
  themeColor: '#0c0c0c',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="bg-[#0c0c0c]">
      <link rel="icon" type="image/svg+xml" href="/gemini-svg.svg"></link>
      <link rel="manifest" href="/manifest.json"></link>
      <body className={`${inter.className} bg-[#0c0c0c] text-[#f0ede8]`}>
        <BottomNav />
        <main className="md:ml-[200px] min-h-screen bg-[#0c0c0c]">
          {children}
        </main>
      </body>
    </html>
  )
}
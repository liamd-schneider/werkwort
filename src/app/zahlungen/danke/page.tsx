'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ZahlungDankeInner() {
  const searchParams = useSearchParams()
  const nr = searchParams.get('nr') || ''

  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold mb-3">Zahlung erfolgreich!</h1>
        <p className="text-[#555] mb-2">
          {nr ? `Rechnung ${nr} wurde bezahlt.` : 'Ihre Zahlung wurde erfolgreich verarbeitet.'}
        </p>
        <p className="text-sm text-[#444] mb-8">
          Der Handwerker wurde automatisch benachrichtigt. Sie erhalten in Kürze eine Bestätigung.
        </p>
        <p className="text-xs text-[#333]">Diese Seite kann geschlossen werden.</p>
      </div>
    </div>
  )
}

export default function ZahlungDankePage() {
  return (
    <div className="fixed inset-0 z-50 bg-[#0c0c0c]">
      <Suspense fallback={<div className="fixed inset-0 bg-[#0c0c0c]"/>}>
        <ZahlungDankeInner />
      </Suspense>
    </div>
  )
}
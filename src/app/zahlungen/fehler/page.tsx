'use client'

export default function ZahlungFehlerPage() {
  return (
    <div className="min-h-screen bg-[#0c0c0c] text-[#f0ede8] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold mb-3">Zahlung fehlgeschlagen</h1>
        <p className="text-[#555] mb-8">Die Zahlung konnte nicht verarbeitet werden. Bitte versuche es erneut oder kontaktiere den Rechnungssteller.</p>
        <p className="text-xs text-[#333]">Diese Seite kann geschlossen werden.</p>
      </div>
    </div>
  )
}
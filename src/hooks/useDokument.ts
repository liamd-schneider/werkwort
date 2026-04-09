import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dokument, DokumentTyp } from '@/types'

interface UseDokumentReturn {
  generieren: (eingabe: string, typ: DokumentTyp, baustelle?: string) => Promise<{ dokument?: Dokument; eintragId?: string; typ: DokumentTyp } | null>
  loading: boolean
  error: string | null
}

export function useDokument(): UseDokumentReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generieren = async (
    eingabe: string,
    typ: DokumentTyp,
    baustelle?: string
  ) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Bitte zuerst einloggen')
        return null
      }

      const response = await fetch('/api/dokument', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eingabe, typ, baustelle }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Fehler beim Erstellen')
        return null
      }

      return {
        dokument: typ !== 'bautagebuch' ? result.data as Dokument : undefined,
        eintragId: typ === 'bautagebuch' ? result.data.id : undefined,
        typ: result.typ,
      }

    } catch {
      setError('Netzwerkfehler — bitte erneut versuchen')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { generieren, loading, error }
}
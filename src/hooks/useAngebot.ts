import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dokument } from '@/types'

interface UseAngebotReturn {
  generieren: (eingabe: string) => Promise<Dokument | null>
  loading: boolean
  error: string | null
}

export function useAngebot(): UseAngebotReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generieren = async (eingabe: string): Promise<Dokument | null> => {
    setLoading(true)
    setError(null)

    try {
      // Auth Token holen
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Bitte zuerst einloggen')
        return null
      }

      const response = await fetch('/api/angebot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eingabe }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Fehler beim Erstellen')
        return null
      }

      return result.data as Dokument

    } catch (err) {
      setError('Netzwerkfehler — bitte erneut versuchen')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { generieren, loading, error }
}
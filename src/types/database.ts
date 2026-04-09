export type Database = {
  public: {
    Tables: {
      betriebe: {
        Row: {
          id: string
          user_id: string
          name: string
          adresse: string
          telefon: string | null
          email: string | null
          steuernummer: string | null
          iban: string | null
          logo_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['betriebe']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['betriebe']['Insert']>
      }
      preispositionen: {
        Row: {
          id: string
          user_id: string
          beschreibung: string
          einheit: string
          preis: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['preispositionen']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['preispositionen']['Insert']>
      }
      token_konten: {
        Row: {
          id: string
          user_id: string
          guthaben: number
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['token_konten']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['token_konten']['Insert']>
      }
      token_transaktionen: {
        Row: {
          id: string
          user_id: string
          betrag: number
          beschreibung: string
          stripe_session: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['token_transaktionen']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['token_transaktionen']['Insert']>
      }
      dokumente: {
        Row: {
          id: string
          user_id: string
          typ: string
          status: string
          nummer: string
          kunde_name: string
          kunde_adresse: string | null
          positionen: unknown
          netto: number
          mwst: number
          brutto: number
          anmerkungen: string | null
          ausfuehrungszeitraum: string | null
          gueltig_bis: string | null
          zahlungsziel: number | null
          token_verbraucht: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['dokumente']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['dokumente']['Insert']>
      }
      bautagebuch: {
        Row: {
          id: string
          user_id: string
          baustelle: string
          datum: string
          arbeiter: number
          ausgefuehrte_arbeiten: string
          lieferungen: string | null
          besuche: string | null
          besonderheiten: string | null
          wetter: string | null
          fotos: string[] | null
          token_verbraucht: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['bautagebuch']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['bautagebuch']['Insert']>
      }
    }
    Functions: {
      verbrauche_token: {
        Args: {
          p_user_id: string
          p_anzahl: number
          p_beschreibung: string
        }
        Returns: boolean
      }
    }
  }
}
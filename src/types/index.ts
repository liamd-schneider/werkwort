// ─── Nutzer & Betrieb ───────────────────────────────────────────
export interface Betrieb {
  id: string
  user_id: string
  name: string
  adresse: string
  telefon?: string
  email?: string
  steuernummer?: string
  iban?: string
  logo_url?: string
  created_at: string
}

export interface Preisposition {
  beschreibung: string
  einheit: string
  preis: number
}

// ─── Token ──────────────────────────────────────────────────────
export interface TokenKonto {
  id: string
  user_id: string
  guthaben: number
  updated_at: string
}

export type TokenPaket = {
  id: string
  name: string
  token: number
  preis: number
  stripe_price_id: string
  beliebt?: boolean
}

export const TOKEN_PAKETE: TokenPaket[] = [
  {
    id: 'starter',
    name: 'Starter',
    token: 25,
    preis: 9,
    stripe_price_id: 'price_starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    token: 100,
    preis: 29,
    stripe_price_id: 'price_pro',
    beliebt: true,
  },
  {
    id: 'team',
    name: 'Team',
    token: 300,
    preis: 59,
    stripe_price_id: 'price_team',
  },
]

// Token-Kosten pro Dokumenttyp
export const TOKEN_KOSTEN = {
  angebot: 2,
  rechnung: 1,
  bauvertrag: 3,
  bautagebuch: 1,
} as const

// ─── Dokumente ──────────────────────────────────────────────────
export type DokumentTyp = 'angebot' | 'rechnung' | 'bauvertrag' | 'bautagebuch'
export type DokumentStatus = 'entwurf' | 'offen' | 'angenommen' | 'bezahlt' | 'abgelehnt' | 'ueberfaellig'

export interface Dokument {
  id: string
  user_id: string
  typ: DokumentTyp
  status: DokumentStatus
  nummer: string
  kunde_name: string
  kunde_adresse?: string
  positionen: AngebotPosition[]
  netto: number
  mwst: number
  brutto: number
  anmerkungen?: string
  ausfuehrungszeitraum?: string
  gueltig_bis?: string
  zahlungsziel?: number
  token_verbraucht: number
  created_at: string
  updated_at: string
}

export interface AngebotPosition {
  beschreibung: string
  menge: number
  einheit: string
  einzelpreis: number
  gesamtpreis: number
}

// ─── KI-Extraktion ──────────────────────────────────────────────
export interface AngebotExtraktion {
  kunde: {
    name: string
    adresse: string
  }
  positionen: AngebotPosition[]
  ausfuehrungszeitraum: string | null
  anmerkungen: string | null
}

export interface BautagebuchExtraktion {
  datum: string
  arbeiter: number
  ausgefuehrteArbeiten: string
  lieferungen: string | null
  besuche: string | null
  besonderheiten: string | null
  wetter: string | null
}

// ─── Bautagebuch ────────────────────────────────────────────────
export interface BautagebuchEintrag {
  id: string
  user_id: string
  baustelle: string
  datum: string
  arbeiter: number
  ausgefuehrte_arbeiten: string
  lieferungen?: string
  besuche?: string
  besonderheiten?: string
  wetter?: string
  fotos?: string[]
  token_verbraucht: number
  created_at: string
}

// ─── API Response Types ──────────────────────────────────────────
export interface ApiResponse<T> {
  data?: T
  error?: string
  success: boolean
}
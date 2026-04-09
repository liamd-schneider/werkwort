import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

// Nur für API Routes — niemals in 'use client' Dateien importieren
export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
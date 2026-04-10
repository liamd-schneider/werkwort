import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// ═══════════════════════════════════════════════════════════════
// Lexware Office Public API Integration
// Docs: https://developers.lexware.io/docs/
// Endpoint: https://api.lexware.io/v1/
// Auth: API-Key im Header → "Authorization: Bearer {apiKey}"
// Rate limit: 2 requests/second
// ═══════════════════════════════════════════════════════════════

const LEXWARE_BASE = 'https://api.lexware.io/v1'

// ── Lexware API aufrufen ─────────────────────────────────────────
async function lexwareRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: object
): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
  try {
    const res = await fetch(`${LEXWARE_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.status === 429) return { ok: false, error: 'Rate limit erreicht — bitte kurz warten', status: 429 }
    if (res.status === 401) return { ok: false, error: 'API-Key ungültig oder abgelaufen', status: 401 }
    if (res.status === 403) return { ok: false, error: 'Keine Berechtigung — XL-Plan erforderlich', status: 403 }

    const data = res.status !== 204 ? await res.json() : null
    return { ok: res.ok, data, status: res.status }

  } catch (err: any) {
    return { ok: false, error: err.message }
  }
}

// ── Rate-Limit-sicheres Warten ────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  // ── Verbindungsstatus ────────────────────────────────────────
  if (action === 'status') {
    const { data: integration } = await (supabaseAdmin as any)
      .from('integrationen')
      .select('aktiv,meta,erstellt_am')
      .eq('user_id', user.id)
      .eq('provider', 'lexware')
      .single()

    if (!integration?.aktiv) return NextResponse.json({ verbunden: false })

    return NextResponse.json({
      verbunden:       true,
      organisation:    integration.meta?.organisation_name,
      letzter_sync:    integration.meta?.letzter_sync,
      sync_stats:      integration.meta?.sync_stats,
      verbunden_am:    integration.erstellt_am,
    })
  }

  // ── API-Key testen ───────────────────────────────────────────
  if (action === 'test') {
    const apiKey = searchParams.get('key')
    if (!apiKey) return NextResponse.json({ error: 'API-Key fehlt' }, { status: 400 })

    const result = await lexwareRequest(apiKey, 'GET', '/profile')
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error })

    return NextResponse.json({
      ok:           true,
      organisation: result.data?.companyName || result.data?.organizationId,
    })
  }

  // ── Sync-Log laden ───────────────────────────────────────────
  if (action === 'log') {
    const { data: log } = await (supabaseAdmin as any)
      .from('lexware_sync_log')
      .select('*')
      .eq('user_id', user.id)
      .order('erstellt_am', { ascending: false })
      .limit(20)

    return NextResponse.json({ log: log || [] })
  }

  // ── Verbindung trennen ───────────────────────────────────────
  if (action === 'disconnect') {
    await (supabaseAdmin as any)
      .from('integrationen')
      .update({ aktiv: false, access_token: null })
      .eq('user_id', user.id)
      .eq('provider', 'lexware')
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

  const { action, apiKey, dokumentIds } = await req.json()

  // ── API-Key speichern / Verbindung herstellen ────────────────
  if (action === 'connect') {
    if (!apiKey) return NextResponse.json({ error: 'API-Key fehlt' }, { status: 400 })

    // Key testen
    const test = await lexwareRequest(apiKey, 'GET', '/profile')
    if (!test.ok) return NextResponse.json({ error: test.error || 'API-Key ungültig' }, { status: 400 })

    const orgName = test.data?.companyName || test.data?.name || 'Lexware Organisation'

    await (supabaseAdmin as any).from('integrationen').upsert({
      user_id:      user.id,
      provider:     'lexware',
      aktiv:        true,
      access_token: apiKey,
      meta:         { organisation_name: orgName },
      erstellt_am:  new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id,provider' })

    return NextResponse.json({ success: true, organisation: orgName })
  }

  // ── Einzelnes Dokument zu Lexware übertragen ─────────────────
  if (action === 'sync_dokument') {
    const { dokumentId } = await req.json().catch(() => ({}))
    return await syncEinzelDokument(user.id, dokumentId)
  }

  // ── Alle offenen Rechnungen zu Lexware übertragen ────────────
  if (action === 'sync_alle') {
    const { data: integration } = await (supabaseAdmin as any)
      .from('integrationen')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'lexware')
      .single()

    if (!integration?.access_token) {
      return NextResponse.json({ error: 'Lexware nicht verbunden' }, { status: 400 })
    }

    // Rechnungen laden die noch nicht übertragen wurden
    const { data: rechnungen } = await (supabaseAdmin as any)
      .from('dokumente')
      .select('*')
      .eq('user_id', user.id)
      .eq('typ', 'rechnung')
      .in('status', ['offen', 'angenommen', 'bezahlt'])
      .order('created_at', { ascending: true })

    let erfolg = 0; let fehler = 0
    const ergebnisse: any[] = []

    for (const dok of rechnungen || []) {
      await sleep(600) // Rate limit: max 2/sec → 600ms Abstand

      const result = await uebertragRechnung(
        integration.access_token, dok, user.id
      )

      if (result.success) erfolg++
      else fehler++
      ergebnisse.push({ id: dok.id, nummer: dok.nummer, ...result })
    }

    // Letzten Sync speichern
    await (supabaseAdmin as any).from('integrationen').update({
      meta: {
        letzter_sync: new Date().toISOString(),
        sync_stats:   { erfolg, fehler, gesamt: (rechnungen || []).length }
      },
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('provider', 'lexware')

    return NextResponse.json({ success: true, erfolg, fehler, ergebnisse })
  }

  return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 })
}

// ─── Einzeldokument übertragen ───────────────────────────────────
async function syncEinzelDokument(userId: string, dokumentId: string) {
  const { data: integration } = await (supabaseAdmin as any)
    .from('integrationen')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'lexware')
    .single()

  if (!integration?.access_token) {
    return NextResponse.json({ error: 'Lexware nicht verbunden' }, { status: 400 })
  }

  const { data: dok } = await (supabaseAdmin as any)
    .from('dokumente').select('*').eq('id', dokumentId).eq('user_id', userId).single()

  if (!dok) return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 })

  const result = await uebertragRechnung(integration.access_token, dok, userId)
  return NextResponse.json(result)
}

// ─── Rechnung zu Lexware übertragen ─────────────────────────────
async function uebertragRechnung(apiKey: string, dok: any, userId: string) {
  try {
    // 1. Kontakt anlegen oder finden
    const kontaktId = await findeOderErzeugeKontakt(apiKey, dok)

    // 2. Positionen aufbereiten
    const positionen = (dok.positionen || []).map((p: any) => ({
      type:        'custom',
      name:        p.beschreibung,
      quantity:    p.menge,
      unitName:    p.einheit,
      unitPrice: {
        currency:  'EUR',
        netAmount: p.einzelpreis,
        taxRatePercentage: 19,
      },
      discountPercentage: 0,
    }))

    // 3. Rechnungs-Payload bauen
    const rechnungPayload: any = {
      archived:   false,
      voucherDate: new Date(dok.created_at).toISOString(),
      address: {
        contactId: kontaktId || undefined,
        name:      dok.kunde_name,
        street:    extractStrasse(dok.kunde_adresse),
        zip:       extractPLZ(dok.kunde_adresse),
        city:      extractOrt(dok.kunde_adresse),
        countryCode: 'DE',
      },
      lineItems:   positionen,
      totalPrice: {
        currency:         'EUR',
        totalNetAmount:   dok.netto,
        totalTaxAmount:   dok.mwst,
        totalGrossAmount: dok.brutto,
      },
      taxAmounts: [{
        taxRatePercentage: 19,
        taxAmount:         dok.mwst,
        netAmount:         dok.netto,
      }],
      taxConditions: {
        taxType: 'net',
      },
      paymentConditions: {
        paymentTermLabel:   `${dok.zahlungsziel || 14} Tage netto`,
        paymentTermDuration: dok.zahlungsziel || 14,
      },
      ...(dok.nummer ? { voucherNumber: dok.nummer } : {}),
      ...(dok.anmerkungen ? { introduction: dok.anmerkungen } : {}),
    }

    // 4. Rechnung in Lexware anlegen
    const result = await lexwareRequest(apiKey, 'POST', '/invoices?finalize=true', rechnungPayload)

    // 5. Sync-Log schreiben
    await (supabaseAdmin as any).from('lexware_sync_log').insert({
      user_id:     userId,
      dokument_id: dok.id,
      lexware_id:  result.data?.id,
      typ:         'invoice',
      status:      result.ok ? 'success' : 'error',
      fehler:      result.ok ? null : (result.error || JSON.stringify(result.data)),
    })

    if (!result.ok) {
      return { success: false, error: result.error || 'Lexware-Fehler', details: result.data }
    }

    return { success: true, lexware_id: result.data?.id, nummer: dok.nummer }

  } catch (err: any) {
    await (supabaseAdmin as any).from('lexware_sync_log').insert({
      user_id:     userId,
      dokument_id: dok.id,
      typ:         'invoice',
      status:      'error',
      fehler:      err.message,
    })
    return { success: false, error: err.message }
  }
}

// ─── Kontakt in Lexware finden oder anlegen ──────────────────────
async function findeOderErzeugeKontakt(apiKey: string, dok: any): Promise<string | null> {
  try {
    // Erst suchen
    const suche = await lexwareRequest(apiKey, 'GET',
      `/contacts?email=${encodeURIComponent('')}&name=${encodeURIComponent(dok.kunde_name)}`
    )

    if (suche.ok && suche.data?.content?.length > 0) {
      return suche.data.content[0].id
    }

    // Nicht gefunden → anlegen
    const kontaktPayload = {
      roles: {
        customer: { number: undefined },
      },
      company: {
        name:                dok.kunde_name,
        allowTaxFreeInvoices: false,
      },
      addresses: {
        billing: [{
          street:      extractStrasse(dok.kunde_adresse),
          zip:         extractPLZ(dok.kunde_adresse),
          city:        extractOrt(dok.kunde_adresse),
          countryCode: 'DE',
        }],
      },
      version: 0,
    }

    const anlegen = await lexwareRequest(apiKey, 'POST', '/contacts', kontaktPayload)
    return anlegen.ok ? anlegen.data?.id : null

  } catch {
    return null
  }
}

// ─── Adress-Parsing ──────────────────────────────────────────────
function extractStrasse(adresse: string | null): string {
  if (!adresse) return ''
  const parts = adresse.split(',')
  return parts[0]?.trim() || ''
}

function extractPLZ(adresse: string | null): string {
  if (!adresse) return ''
  const match = adresse.match(/\b(\d{5})\b/)
  return match?.[1] || ''
}

function extractOrt(adresse: string | null): string {
  if (!adresse) return ''
  const match = adresse.match(/\d{5}\s+(.+)/)
  return match?.[1]?.split(',')[0]?.trim() || ''
}
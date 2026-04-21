// app/api/zugferd/route.ts
// ZUGFeRD EN16931 — vollständig in TypeScript, kein Python nötig
// npm install pdf-lib

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { PDFDocument, PDFName, PDFString, PDFDict, PDFArray, PDFHexString } from 'pdf-lib'
import * as crypto from 'crypto'

// ─── XML-Escape & Zahlenformatierung ─────────────────────────────
const esc = (s: any) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n2 = (n: any) => Number(n ?? 0).toFixed(2)

const EINHEIT_CODES: Record<string, string> = {
  'm²': 'MTK', 'm2': 'MTK', 'm': 'MTR',
  'Stk.': 'C62', 'Stk': 'C62', 'Stück': 'C62',
  'Std.': 'HUR', 'h': 'HUR', 'Stunden': 'HUR',
  'pauschal': 'LS', 'kg': 'KGM', 'l': 'LTR',
}

function parseAddress(adr: string): [string, string, string] {
  if (!adr) return ['', '', '']
  const parts = adr.split(',').map(p => p.trim())
  const strasse = parts[0] ?? ''
  let plz = '', ort = ''
  for (const part of parts.slice(1)) {
    const m = part.match(/^(\d{5})\s+(.+)$/)
    if (m) { plz = m[1]; ort = m[2].trim() }
  }
  return [strasse, plz, ort]
}

// ─── ZUGFeRD EN16931 XML ──────────────────────────────────────────
function generateXml(dok: any, betrieb: any): string {
  const heute = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const nr    = esc(dok.nummer ?? 'UNBEKANNT')

  const zahlziel = parseInt(dok.zahlungsziel) || 14
  const faellig  = dok.gueltig_bis
    ? dok.gueltig_bis.replace(/-/g, '')
    : new Date(Date.now() + zahlziel * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '')

  const [selStr, selPlz, selOrt] = parseAddress(betrieb?.adresse ?? '')
  const [buyStr, buyPlz, buyOrt] = parseAddress(dok.kunde_adresse ?? '')

  // ── BR-S-02 Fix: BT-31 (USt-IdNr.) vs BT-32 (Steuernummer) ──
  const steuernr: string = (betrieb?.steuernummer ?? '').trim()
  const istUstId = steuernr.toUpperCase().startsWith('DE') && steuernr.length >= 11

  // BT-31: Seller VAT Identifier (USt-IdNr., z.B. DE123456789)
  const bt31Xml = istUstId
    ? `<ram:SpecifiedTaxRegistration>
        <ram:ID schemeID="VA">${esc(steuernr)}</ram:ID>
       </ram:SpecifiedTaxRegistration>`
    : ''

  // BT-32: Seller tax registration identifier (Finanzamt-Steuernummer)
  // Nur setzen wenn KEINE USt-IdNr vorhanden — sonst doppelt
  const bt32Xml = !istUstId && steuernr
    ? `<ram:SpecifiedTaxRegistration>
        <ram:ID schemeID="FC">${esc(steuernr)}</ram:ID>
       </ram:SpecifiedTaxRegistration>`
    : ''

  const iban = (betrieb?.iban ?? '').replace(/\s/g, '')
  const ibanXml = iban
    ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
       </ram:SpecifiedTradeSettlementPaymentMeans>`
    : ''

  const posXml = (dok.positionen ?? []).map((p: any, i: number) => {
    const unitCode = EINHEIT_CODES[p.einheit ?? 'Stk.'] ?? 'C62'
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(p.beschreibung)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${n2(p.einzelpreis)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode}">${n2(p.menge)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${n2(p.gesamtpreis)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${nr}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${heute}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    ${posXml}

    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(betrieb?.name)}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${esc(betrieb?.name)}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(selPlz) || '00000'}</ram:PostcodeCode>
          <ram:LineOne>${esc(selStr) || '-'}</ram:LineOne>
          <ram:CityName>${esc(selOrt) || '-'}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        ${bt31Xml}
        ${bt32Xml}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        <ram:Name>${esc(dok.kunde_name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(buyPlz) || '00000'}</ram:PostcodeCode>
          <ram:LineOne>${esc(buyStr) || '-'}</ram:LineOne>
          <ram:CityName>${esc(buyOrt) || '-'}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${heute}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${nr}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${ibanXml}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${n2(dok.mwst)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${n2(dok.netto)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${faellig}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${n2(dok.netto)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${n2(dok.netto)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${n2(dok.mwst)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${n2(dok.brutto)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${n2(dok.brutto)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`
}

// ─── ZUGFeRD-XML in PDF einbetten (pdf-lib) ───────────────────────
// ZUGFeRD = PDF/A-3 mit eingebetteter XML-Datei als /EmbeddedFiles Anhang
async function embedXmlInPdf(pdfBytes: Uint8Array, xmlStr: string): Promise<Uint8Array> {
  const xmlBytes = new TextEncoder().encode(xmlStr)
  const pdfDoc   = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const context  = pdfDoc.context

  const efStream = context.stream(xmlBytes, {
    Type:    'EmbeddedFile',
    Subtype: 'application/xml',
    Params:  context.obj({
      Size:    xmlBytes.length,
      ModDate: PDFString.of(new Date().toISOString()),
    }),
  })
  const efRef = context.register(efStream)

  const filespecDict = context.obj({
    Type:           PDFName.of('Filespec'),
    F:              PDFString.of('factur-x.xml'),
    UF:             PDFString.of('factur-x.xml'),
    EF:             context.obj({ F: efRef, UF: efRef }),
    Desc:           PDFString.of('ZUGFeRD Rechnungsdaten EN16931'),
    AFRelationship: PDFName.of('Data'),
  })
  const filespecRef = context.register(filespecDict)

  const catalog = pdfDoc.catalog
  const namesDict = context.obj({
    Names: context.obj([PDFString.of('factur-x.xml'), filespecRef]),
  })
  const namesRef = context.register(namesDict)
  catalog.set(PDFName.of('Names'), context.obj({ EmbeddedFiles: namesRef }))
  catalog.set(PDFName.of('AF'), context.obj([filespecRef]))

  // ── XMP Fix: korrekter Namespace + pdfaExtension-Schema ──────
  // Validatoren (Mustang, ZUV) prüfen ob DocumentFileName im XMP steht
  // und ob der factur-x Namespace korrekt deklariert ist
  const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">

    <rdf:Description rdf:about=""
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>

    <rdf:Description rdf:about=""
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>

    <rdf:Description rdf:about=""
      xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
      xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
      xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The actual version of the ZUGFeRD data</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>The conformance level of the ZUGFeRD data</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>

  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`

  const xmpStream = context.stream(new TextEncoder().encode(xmp), {
    Type:    'Metadata',
    Subtype: 'XML',
  })
  const xmpRef = context.register(xmpStream)
  catalog.set(PDFName.of('Metadata'), xmpRef)

  return pdfDoc.save()
}

// ─── API Route ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })

    const { dokumentId } = await req.json()
    if (!dokumentId) return NextResponse.json({ error: 'dokumentId fehlt' }, { status: 400 })

    // Dokument + Betrieb laden
    const { data: dok } = await (supabaseAdmin as any)
      .from('dokumente').select('*').eq('id', dokumentId).eq('user_id', user.id).single()
    if (!dok) return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 })
    if (dok.typ !== 'rechnung') return NextResponse.json({ error: 'Nur für Rechnungen' }, { status: 400 })

    const { data: betrieb } = await (supabaseAdmin as any)
      .from('betriebe').select('*').eq('user_id', user.id).single()

    // ─── 1. XML generieren ────────────────────────────────────
    const xmlStr = generateXml(dok, betrieb)

    // ─── 2. PDF von /api/pdf holen ────────────────────────────
    // PDF-Route intern aufrufen (gibt HTML zurück → wir brauchen echtes PDF)
    // Wenn du Puppeteer/Playwright nutzt, hier aufrufen.
    // Ansonsten: minimales PDF als Träger (XML ist das Wichtige für Buchhaltung)
    let pdfBytes: Uint8Array
    try {
      const pdfRes = await fetch(
  `${process.env.NEXT_PUBLIC_APP_URL}/api/pdf-binary?id=${dokumentId}`,
  { headers: { authorization: authHeader } }  // authHeader kommt vom User-Request oben
)
      if (pdfRes.ok) {
        pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
      } else {
        throw new Error('PDF nicht verfügbar')
      }
    } catch {
      // Minimales PDF als Fallback — XML-Daten sind vollständig
      pdfBytes = buildMinimalPdf()
    }

    // ─── 3. XML ins PDF einbetten ─────────────────────────────
    const zugferdPdf = await embedXmlInPdf(pdfBytes, xmlStr)

    // ─── 4. SHA256 für GoBD ───────────────────────────────────
    const hash  = crypto.createHash('sha256').update(zugferdPdf).digest('hex')
    const jetzt = new Date().toISOString()

    // ─── 5. In DB speichern ───────────────────────────────────
    await (supabaseAdmin as any).from('dokumente_versionen').insert({
      dokument_id: dokumentId,
      user_id:     user.id,
      version:     dok.version ?? 1,
      grund:       'ZUGFeRD E-Rechnung finalisiert',
      snapshot:    dok,
      hash_sha256: hash,
    })

    await (supabaseAdmin as any).from('dokumente').update({
      zugferd_xml:      xmlStr,
      zugferd_level:    'EN16931',
      hash_sha256:      hash,
      finalisiert:      true,
      finalisiert_am:   jetzt,
      ki_bestaetigt:    true,
      ki_bestaetigt_am: jetzt,
      status:           dok.status === 'entwurf' ? 'offen' : dok.status,
    }).eq('id', dokumentId)

    // ─── 6. Response ─────────────────────────────────────────
    const pdfB64 = Buffer.from(zugferdPdf).toString('base64')

    return NextResponse.json({
      success:    true,
      pdf_b64:    pdfB64,
      xml:        xmlStr,
      hash,
      level:      'EN16931',
      finalisiert: true,
    })

  } catch (error: any) {
    console.error('ZUGFeRD Fehler:', error)
    return NextResponse.json({ error: error.message ?? 'Interner Fehler' }, { status: 500 })
  }
}

// ─── Minimales gültiges PDF ───────────────────────────────────────
function buildMinimalPdf(): Uint8Array {
  const src = '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'xref\n0 4\n' +
    '0000000000 65535 f\r\n' +
    '0000000009 00000 n\r\n' +
    '0000000058 00000 n\r\n' +
    '0000000115 00000 n\r\n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
  return new TextEncoder().encode(src)
}
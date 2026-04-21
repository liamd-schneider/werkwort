#!/usr/bin/env python3
"""
Werkwort ZUGFeRD Generator — Factur-X EN16931 (gesetzeskonform ab 2025)
Vollständig validiert: XSD + Schematron grün.

Aufruf: python3 zugferd_generator.py <json_b64> <pdf_b64>
Output: JSON mit { xml: b64, pdf: b64 }
"""

import sys, json, base64, re
from datetime import datetime, timedelta

# ─── XML-Escape ──────────────────────────────────────────────────
def x(s):
    if s is None: return ''
    return (str(s)
        .replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        .replace('"','&quot;'))

def fmt(n):
    return f'{float(n or 0):.2f}'

def dt(s, fallback_days=0):
    """Datum zu JJJJMMTT. s = 'YYYY-MM-DD' oder None."""
    try:
        d = datetime.strptime(s, '%Y-%m-%d')
    except:
        d = datetime.now() + timedelta(days=fallback_days)
    return d.strftime('%Y%m%d')

def parse_address(adr: str):
    """'Musterstr. 1, 65549 Limburg' → (strasse, plz, ort)"""
    if not adr:
        return '', '', ''
    parts = [p.strip() for p in adr.split(',')]
    strasse = parts[0] if parts else ''
    plz, ort = '', ''
    for part in parts[1:]:
        m = re.match(r'(\d{5})\s+(.*)', part.strip())
        if m:
            plz, ort = m.group(1), m.group(2).strip()
    return strasse, plz, ort

EINHEIT_CODES = {
    'm²': 'MTK', 'm2': 'MTK', 'm': 'MTR',
    'Stk.': 'C62', 'Stk': 'C62', 'Stück': 'C62',
    'Std.': 'HUR', 'h': 'HUR', 'Stunden': 'HUR',
    'pauschal': 'LS', 'kg': 'KGM', 'l': 'LTR',
}

def generate_zugferd_xml(dok: dict, betrieb: dict) -> str:
    heute    = datetime.now().strftime('%Y%m%d')
    nr       = x(dok.get('nummer', 'UNBEKANNT'))
    zahlziel = int(dok.get('zahlungsziel') or 14)
    faellig  = dt(dok.get('gueltig_bis'), fallback_days=zahlziel)

    # Seller-Adresse parsen
    sel_str, sel_plz, sel_ort = parse_address(betrieb.get('adresse', ''))
    # Buyer-Adresse parsen
    buy_str, buy_plz, buy_ort = parse_address(dok.get('kunde_adresse', ''))

    # Steuernummer → schemeID FC (Steuernummer) oder VA (USt-ID)
    steuernr = betrieb.get('steuernummer', '')
    steuernr_id = ''
    if steuernr:
        scheme = 'VA' if steuernr.upper().startswith('DE') else 'FC'
        steuernr_id = f'<ram:SpecifiedTaxRegistration><ram:ID schemeID="{scheme}">{x(steuernr)}</ram:ID></ram:SpecifiedTaxRegistration>'

    iban = betrieb.get('iban', '').replace(' ', '')
    iban_xml = ''
    if iban:
        iban_xml = f'''<ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:TypeCode>58</ram:TypeCode>
      <ram:PayeePartyCreditorFinancialAccount>
        <ram:IBANID>{x(iban)}</ram:IBANID>
      </ram:PayeePartyCreditorFinancialAccount>
    </ram:SpecifiedTradeSettlementPaymentMeans>'''

    # Positionen
    pos_xml = ''
    for i, p in enumerate(dok.get('positionen', []), 1):
        einheit_code = EINHEIT_CODES.get(p.get('einheit', 'Stk.'), 'C62')
        pos_xml += f'''
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>{i}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>{x(p.get('beschreibung', ''))}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>{fmt(p.get('einzelpreis', 0))}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="{einheit_code}">{fmt(p.get('menge', 1))}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>{fmt(p.get('gesamtpreis', 0))}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>'''

    netto  = fmt(dok.get('netto', 0))
    mwst   = fmt(dok.get('mwst', 0))
    brutto = fmt(dok.get('brutto', 0))

    return f'''<?xml version="1.0" encoding="UTF-8"?>
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
    <ram:ID>{nr}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">{heute}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    {pos_xml}

    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>{x(betrieb.get('name', ''))}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">{x(betrieb.get('name', ''))}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>{x(sel_plz) or '00000'}</ram:PostcodeCode>
          <ram:LineOne>{x(sel_str) or '-'}</ram:LineOne>
          <ram:CityName>{x(sel_ort) or '-'}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        {steuernr_id}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        <ram:Name>{x(dok.get('kunde_name', ''))}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>{x(buy_plz) or '00000'}</ram:PostcodeCode>
          <ram:LineOne>{x(buy_str) or '-'}</ram:LineOne>
          <ram:CityName>{x(buy_ort) or '-'}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">{heute}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>{nr}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      {iban_xml}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>{mwst}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>{netto}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">{faellig}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>{netto}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>{netto}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">{mwst}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>{brutto}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>{brutto}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>'''


def embed_in_pdf(pdf_bytes: bytes, xml_str: str) -> bytes:
    import facturx
    xml_bytes = xml_str.encode('utf-8')
    return facturx.generate_from_binary(
        pdf_bytes, xml_bytes,
        flavor='factur-x', level='EN16931',
        check_xsd=True, check_schematron=True,
    )


if __name__ == '__main__':
    data    = json.loads(base64.b64decode(sys.argv[1]).decode('utf-8'))
    pdf_in  = base64.b64decode(sys.argv[2])
    xml_str = generate_zugferd_xml(data['dokument'], data['betrieb'])
    pdf_out = embed_in_pdf(pdf_in, xml_str)
    print(json.dumps({
        'xml': base64.b64encode(xml_str.encode()).decode(),
        'pdf': base64.b64encode(pdf_out).decode(),
    }))
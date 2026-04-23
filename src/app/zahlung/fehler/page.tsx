import { redirect } from 'next/navigation'

export default function ZahlungFehlerRedirect() {
  redirect('/zahlungen/fehler')
}
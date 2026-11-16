/** `PF-E9` · Teléfono, a contact value with its country code apart (TECH-43, ADR-050). */

import { LIVE_IDENTITY, PhoneEditScreen } from '../../src/components/identity-edit'

export default function PhoneRoute() {
  return <PhoneEditScreen sources={LIVE_IDENTITY} />
}

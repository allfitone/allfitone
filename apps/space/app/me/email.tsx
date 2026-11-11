/** `PF-E11` · Correo: the new address, and a code on its way (TECH-44, `OP-IDN-021`). */

import { EmailEditScreen, LIVE_IDENTITY } from '../../src/components/identity-edit'

export default function EmailRoute() {
  return <EmailEditScreen sources={LIVE_IDENTITY} />
}

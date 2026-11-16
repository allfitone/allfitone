/** `PF-E12` · Revisa tu correo: the code from the new inbox (TECH-44, `OP-IDN-022`). */

import { EmailCodeScreen, LIVE_IDENTITY } from '../../src/components/identity-edit'

export default function EmailCodeRoute() {
  return <EmailCodeScreen sources={LIVE_IDENTITY} />
}

/** `PF-E18` · Contraseña: the current one, the new one, and the other sessions closed (TECH-325). */

import { LIVE_PASSWORD, PasswordEditScreen } from '../../src/components/password-edit'

export default function PasswordRoute() {
  return <PasswordEditScreen sources={LIVE_PASSWORD} />
}

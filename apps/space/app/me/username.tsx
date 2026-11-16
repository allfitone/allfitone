/** `PF-E8` · Usuario, on its own screen (TECH-43, `OP-IDN-063`). */

import { LIVE_IDENTITY, NameEditScreen } from '../../src/components/identity-edit'

export default function UsernameRoute() {
  return <NameEditScreen editing="username" sources={LIVE_IDENTITY} />
}

/** `PF-E7` · Nombre y apellido, on its own screen (TECH-43, `OP-IDN-063`). */

import { LIVE_IDENTITY, NameEditScreen } from '../../src/components/identity-edit'

export default function NameRoute() {
  return <NameEditScreen editing="name" sources={LIVE_IDENTITY} />
}

/** `PF-E14` · Zonas de foco, on its own screen («Perfil fitness»). */

import { LIVE_FITNESS, FocusEditScreen } from '../../src/components/fitness-edit'

export default function FocusEditRoute() {
  return <FocusEditScreen sources={LIVE_FITNESS} />
}

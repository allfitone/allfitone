/** `PF-E19b` · Agregar: a pain, a limitation or a recovery, in her words (TECH-326). */

import { HealthFormScreen, LIVE_HEALTH } from '../../../src/components/health-context'

export default function NewHealthRoute() {
  return <HealthFormScreen sources={LIVE_HEALTH} />
}

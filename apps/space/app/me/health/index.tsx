/** `PF-7` · Dolor y limitaciones: what hurts, what limits, what heals and what ended (TECH-326). */

import { HealthListScreen, LIVE_HEALTH } from '../../../src/components/health-context'

export default function HealthRoute() {
  return <HealthListScreen sources={LIVE_HEALTH} />
}

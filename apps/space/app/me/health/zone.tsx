/** `PF-E19c` · Zona: the fourteen areas, grouped; the side goes in her words (TECH-326). */

import { useLocalSearchParams } from 'expo-router'

import { HealthAreaScreen } from '../../../src/components/health-context'
import { HEALTH_AREAS } from '../../../src/client/health-context'

export default function HealthZoneRoute() {
  const { current } = useLocalSearchParams<{ current?: string }>()
  const area = HEALTH_AREAS.find((known) => known === current)
  return <HealthAreaScreen current={area ?? null} />
}

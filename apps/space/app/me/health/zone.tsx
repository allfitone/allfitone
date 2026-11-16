/** `PF-E19c` · Zona: the fourteen areas, grouped; the side goes in her words (TECH-326). */

import { useLocalSearchParams } from 'expo-router'

import { HealthAreaScreen } from '../../../src/components/health-context'
import { AREA_LABEL, type HealthArea } from '../../../src/client/health-context'

export default function HealthZoneRoute() {
  const { current } = useLocalSearchParams<{ current?: string }>()
  const area = Object.keys(AREA_LABEL).find((known): known is HealthArea => known === current)
  return <HealthAreaScreen current={area ?? null} />
}

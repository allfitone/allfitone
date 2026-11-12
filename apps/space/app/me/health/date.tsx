/** `PF-E19e` · Fecha: one wheel of days, for when it started or when it should end (TECH-326). */

import { useLocalSearchParams } from 'expo-router'

import { HealthDateScreen } from '../../../src/components/health-context'

export default function HealthDateRoute() {
  const { kind, offset } = useLocalSearchParams<{ kind?: string; offset?: string }>()
  const parsed = Number(offset)
  return (
    <HealthDateScreen
      kind={kind === 'until' ? 'until' : 'since'}
      offset={Number.isFinite(parsed) ? Math.round(parsed) : 0}
    />
  )
}

/** `PF-E21` · Corregir: changes this claim in place and keeps no versions (TECH-326, ADR-052). */

import { useLocalSearchParams } from 'expo-router'

import { HealthFormScreen, LIVE_HEALTH } from '../../../../src/components/health-context'

export default function CorrectHealthRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <HealthFormScreen sources={LIVE_HEALTH} claimId={id} />
}

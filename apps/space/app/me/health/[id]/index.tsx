/** `PF-E20` · one claim, with «Corregir» and «Eliminar» (`PF-E20b`) (TECH-326). */

import { useLocalSearchParams } from 'expo-router'

import { HealthDetailScreen, LIVE_HEALTH } from '../../../../src/components/health-context'

export default function HealthClaimRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <HealthDetailScreen sources={LIVE_HEALTH} claimId={id} />
}

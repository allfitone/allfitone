/** The versions of one datum of «Perfil fitness» (`OP-IDN-013`); the code names which. */

import { useLocalSearchParams } from 'expo-router'

import { LIVE_FITNESS, VersionsScreen } from '../../src/components/fitness-edit'

export default function VersionsRoute() {
  const { code } = useLocalSearchParams<{ code: string }>()
  return <VersionsScreen sources={LIVE_FITNESS} code={code} />
}

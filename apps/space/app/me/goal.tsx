/** `PF-E13` · Tu objetivo, on its own screen («Perfil fitness»). */

import { LIVE_FITNESS, GoalEditScreen } from '../../src/components/fitness-edit'

export default function GoalEditRoute() {
  return <GoalEditScreen sources={LIVE_FITNESS} />
}

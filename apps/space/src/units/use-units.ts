/** The units a screen draws with; re-renders when the person changes them. */

import { useSyncExternalStore } from 'react'

import { getUnits, subscribeUnits } from './units-store'
import type { Units } from './units'

export function useUnits(): Units {
  return useSyncExternalStore(subscribeUnits, getUnits, getUnits)
}

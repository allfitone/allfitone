/**
 * The units the app is showing right now, held in memory like the locale.
 *
 * Whoever reads the person's preference calls `setUnits`; every reader of `useUnits()`
 * re-renders at once. Null on either side means «not chosen», which reads as the default.
 */

import { DEFAULT_UNITS, type DistanceUnit, type MassUnit, type Units } from './units'

export interface UnitsChoice {
  readonly mass: MassUnit | null
  readonly distance: DistanceUnit | null
}

export interface UnitsStore {
  readonly get: () => Units
  readonly set: (choice: UnitsChoice) => void
  readonly subscribe: (listener: () => void) => () => void
}

export function createUnitsStore(): UnitsStore {
  let current: Units = DEFAULT_UNITS
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set: (choice) => {
      const next: Units = {
        mass: choice.mass ?? DEFAULT_UNITS.mass,
        distance: choice.distance ?? DEFAULT_UNITS.distance,
      }
      if (next.mass === current.mass && next.distance === current.distance) return
      current = next
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const store = createUnitsStore()

export const getUnits = store.get
export const setUnits = store.set
export const subscribeUnits = store.subscribe

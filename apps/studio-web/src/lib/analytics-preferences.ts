/**
 * Opens the analytics preferences panel from outside the control that owns it.
 *
 * The landing has no floating privacy control: its footer carries a "Privacidad"
 * entry instead, as the Space landing does, and pressing it asks the control to
 * open. A plain listener set is enough, because a request carries no state.
 */
const listeners = new Set<() => void>()

export function openAnalyticsPreferences(): void {
  for (const listener of listeners) listener()
}

export function onAnalyticsPreferencesRequested(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

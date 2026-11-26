'use client'

/**
 * The presentation the clients' registers take, as the reader last chose it.
 *
 * **A preference, not a decision.** The register still answers with cards when
 * rows do not fit its own container, so what is kept here is what she would
 * like when there is room for both, and the default is what these registers
 * already did: a table wherever one fits.
 *
 * Deliberately separate from the library's own choice. The two share a shape
 * and nothing else: the library is `/content/*`, another person's block, and
 * one preference for the whole workspace means moving the machinery out of a
 * file that is not ours to move. When that is agreed, the two collapse into
 * one module and this key disappears.
 *
 * Read through an external store because the choice lives in this browser: the
 * server cannot know it, so the first paint is cards and the stored choice
 * arrives with hydration, without a mismatch.
 */

import { useSyncExternalStore } from 'react'

export type ClientView = 'cards' | 'rows'

export const CLIENTS_VIEW_STORAGE_KEY = 'allfit-studio-clients-view:v1'

/*
 * Rows, where the library defaults to cards. These registers have answered
 * with a table whenever there was room for one since they were written, and a
 * default that flipped them to cards would change what everybody sees for the
 * sake of matching a screen whose items are content, not people.
 */
const DEFAULT_VIEW: ClientView = 'rows'

// What she chose in this visit wins, so the choice holds where storage is blocked.
let chosenView: ClientView | undefined
const listeners = new Set<() => void>()

function rememberedView(): ClientView {
  if (typeof localStorage === 'undefined') return DEFAULT_VIEW
  try {
    return localStorage.getItem(CLIENTS_VIEW_STORAGE_KEY) === 'cards' ? 'cards' : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function shownClientView(): ClientView {
  return chosenView ?? rememberedView()
}

export function chooseClientView(view: ClientView): void {
  chosenView = view
  try {
    localStorage.setItem(CLIENTS_VIEW_STORAGE_KEY, view)
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener()
}

export function subscribeToClientView(listener: () => void): () => void {
  function followOtherTab(event: StorageEvent) {
    if (event.key !== CLIENTS_VIEW_STORAGE_KEY) return
    chosenView = undefined
    listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', followOtherTab)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', followOtherTab)
  }
}

function serverClientView(): ClientView {
  return DEFAULT_VIEW
}

export function useClientView(): [ClientView, (view: ClientView) => void] {
  const view = useSyncExternalStore(subscribeToClientView, shownClientView, serverClientView)
  return [view, chooseClientView]
}

'use client'

/**
 * The view the library's lists take, as the reader last chose it.
 *
 * Read through an external store because the choice lives in this browser: the
 * server cannot know it, so the first paint is cards and the stored choice
 * arrives with hydration, without a mismatch.
 */

import { useSyncExternalStore } from 'react'

import {
  chooseLibraryView,
  shownLibraryView,
  subscribeToLibraryView,
  type LibraryView,
} from './content-library'

function serverLibraryView(): LibraryView {
  return 'cards'
}

export function useLibraryView(): [LibraryView, (view: LibraryView) => void] {
  const view = useSyncExternalStore(subscribeToLibraryView, shownLibraryView, serverLibraryView)
  return [view, chooseLibraryView]
}

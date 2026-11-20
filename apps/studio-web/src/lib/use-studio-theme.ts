'use client'

import { useSyncExternalStore } from 'react'

import {
  shownStudioTheme,
  STUDIO_DEFAULT_THEME,
  subscribeToStudioTheme,
  type StudioTheme,
} from './theme'

/**
 * The theme on screen, read again whenever it changes here or in another tab.
 * The server knows nobody, so it renders the default.
 */
export function useShownStudioTheme(): StudioTheme {
  return useSyncExternalStore(subscribeToStudioTheme, shownStudioTheme, () => STUDIO_DEFAULT_THEME)
}

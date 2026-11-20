'use client'

import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import { studioPreferencesQueryOptions } from './studio-query'
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

/**
 * Asks the account for her theme; the answer goes on screen as it arrives.
 * The workspace asks too, so a browser that never saw her follows her choice.
 */
export function useAccountTheme(): void {
  useQuery(studioPreferencesQueryOptions())
}

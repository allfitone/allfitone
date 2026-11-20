/**
 * What a person chose for how Studio looks: `OP-IDN-068`, `OP-IDN-069`.
 *
 * The choice is kept with her account, so it follows her to another browser or device,
 * and it is Studio's alone: another product that gets themes keeps its own. `theme` is
 * null until she chooses, because the default is the screen's to show and not the
 * server's to invent — changing that default later must not rewrite anybody's choice.
 */

import type { CommandContext, CommandResult } from './index.js'

export type InterfaceTheme = 'dark' | 'light'

export function isInterfaceTheme(value: unknown): value is InterfaceTheme {
  return value === 'dark' || value === 'light'
}

export interface StudioPreferences {
  theme: InterfaceTheme | null
}

export interface StudioPreferencesQuery {
  personId: string
  requestId: string
}

export type StudioPreferencesCommand = CommandContext & {
  personId: string
  theme: InterfaceTheme
}

export interface StudioPreferencesDatabase {
  read(input: StudioPreferencesQuery): Promise<StudioPreferences>
  put(input: StudioPreferencesCommand): Promise<CommandResult<StudioPreferences>>
}

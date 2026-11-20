/**
 * A person's Studio preferences, read and kept as herself (`OP-IDN-068`, `OP-IDN-069`).
 *
 * The rule is the database's: who she is, that the preferences are Studio's, and that a
 * retried command is answered once. Nothing is decided here, and nothing here names a
 * product — the functions behind it are Studio's own.
 */

import type { StudioPreferencesDatabase } from '../domain/studio-preferences.js'

export type {
  InterfaceTheme,
  StudioPreferences,
  StudioPreferencesCommand,
  StudioPreferencesQuery,
} from '../domain/studio-preferences.js'

export interface StudioPreferencesService {
  /** `OP-IDN-068`. */
  read: StudioPreferencesDatabase['read']
  /** `OP-IDN-069`. */
  put: StudioPreferencesDatabase['put']
}

export function createStudioPreferencesService(
  database: StudioPreferencesDatabase,
): StudioPreferencesService {
  return {
    read: (input) => database.read(input),
    put: (input) => database.put(input),
  }
}

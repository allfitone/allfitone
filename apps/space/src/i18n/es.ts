/**
 * The Spanish dictionary: the source of truth for every word the app says.
 *
 * Spanish is written first and English follows it. `Dictionary` is derived from this
 * object, and `en.ts` is typed with it, so a key missing from English, a key English
 * invents, or an interpolation that takes different arguments fails `bun run typecheck`.
 *
 * **Entries are strings or functions.** A text that carries a value or depends on a count
 * is a function — `chosen: (count: number) => …` — so the arguments are typed and each
 * language writes its own plural and word order instead of gluing fragments together.
 *
 * One file per area under `es/`, named as the screens group: a batch of screens adds its
 * area here and in `en.ts`, and two batches never edit the same file.
 */

import { access } from './es/access'
import { common } from './es/common'
import { corrections } from './es/corrections'
import { fitness } from './es/fitness'
import { gyms } from './es/gyms'
import { health } from './es/health'
import { identity } from './es/identity'
import { nutrition } from './es/nutrition'
import { onboarding } from './es/onboarding'
import { password } from './es/password'
import { plans } from './es/plans'
import { pro } from './es/pro'
import { profile } from './es/profile'
import { progress } from './es/progress'
import { session } from './es/session'
import { sharing } from './es/sharing'
import { training } from './es/training'

export const es = {
  access,
  common,
  corrections,
  fitness,
  gyms,
  health,
  identity,
  nutrition,
  onboarding,
  password,
  plans,
  pro,
  profile,
  progress,
  session,
  sharing,
  training,
}

export type Dictionary = typeof es

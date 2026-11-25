/**
 * The English dictionary. Typed with `Dictionary`, derived from Spanish, so it cannot
 * drift: every key Spanish has, English has, with the same arguments.
 *
 * Natural and concise rather than literal, in sentence case and the same professional
 * tone. Proper names — gyms, programs, catalogue exercises, what a coach wrote — are data,
 * never entries here.
 */

import type { Dictionary } from './es'
import { common } from './en/common'
import { fitness } from './en/fitness'
import { health } from './en/health'
import { identity } from './en/identity'
import { password } from './en/password'
import { pro } from './en/pro'
import { profile } from './en/profile'
import { training } from './en/training'

export const en: Dictionary = {
  common,
  fitness,
  health,
  identity,
  password,
  pro,
  profile,
  training,
}

/**
 * The English dictionary. Typed with `Dictionary`, derived from Spanish, so it cannot
 * drift: every key Spanish has, English has, with the same arguments.
 *
 * Natural and concise rather than literal, in sentence case and the same professional
 * tone. Proper names — gyms, programs, catalogue exercises, what a coach wrote — are data,
 * never entries here.
 */

import type { Dictionary } from './es'
import { access } from './en/access'
import { common } from './en/common'
import { corrections } from './en/corrections'
import { fitness } from './en/fitness'
import { gyms } from './en/gyms'
import { health } from './en/health'
import { identity } from './en/identity'
import { invitation } from './en/invitation'
import { notices } from './en/notices'
import { nutrition } from './en/nutrition'
import { onboarding } from './en/onboarding'
import { password } from './en/password'
import { plans } from './en/plans'
import { preferences } from './en/preferences'
import { pro } from './en/pro'
import { profile } from './en/profile'
import { progress } from './en/progress'
import { session } from './en/session'
import { sharing } from './en/sharing'
import { training } from './en/training'

export const en: Dictionary = {
  access,
  common,
  corrections,
  fitness,
  gyms,
  health,
  identity,
  invitation,
  notices,
  nutrition,
  onboarding,
  password,
  plans,
  preferences,
  pro,
  profile,
  progress,
  session,
  sharing,
  training,
}

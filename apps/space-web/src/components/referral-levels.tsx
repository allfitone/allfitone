/**
 * The referral levels as tiles: the count in the display face, what it earns
 * under it. The landing's invite band and the waitlist page share it, so the
 * same table reads the same way wherever a person meets it.
 */

import { REFERRAL_LEVELS, type ReferralLevel } from '@/lib/waitlist'

export function ReferralLevels({
  rewards,
  unit,
  openEnded = false,
}: {
  rewards: Readonly<Record<ReferralLevel, string>>
  /** What the count counts; the landing leaves it to its title. */
  unit?: string
  /** The top level reads «100+», as the landing's offer puts it. */
  openEnded?: boolean
}) {
  return (
    <ul className="levels" role="list">
      {REFERRAL_LEVELS.map((level, index) => (
        <li key={level} className="levels__item">
          <p className="levels__count">
            {openEnded && index === REFERRAL_LEVELS.length - 1 ? `${String(level)}+` : level}
            {unit ? <span className="levels__unit"> {unit}</span> : null}
          </p>
          <p className="levels__reward">{rewards[level]}</p>
        </li>
      ))}
    </ul>
  )
}

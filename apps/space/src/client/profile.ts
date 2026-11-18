/**
 * What the profile tab (`PF-1`) says about the person, worked out without a screen.
 *
 * The profile is an index: each row names a part of the account and, under it, the one
 * fact that tells the person whether to open it. Those facts come from what the API
 * already answers — the name from the training profile, the plan from `GET /pro` — and
 * a row with nothing true to say says what it holds instead of inventing a number.
 */

import { gymsOf, storeName, subscriptionOf, type ProStatus } from './pro'

/** Up to two initials, from the name the person gave; none when there is no name. */
export function initialsOf(name: string): string | undefined {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  return words
    .slice(0, 2)
    .map((word) => word.slice(0, 1).toUpperCase())
    .join('')
}

/** The plan row's caption: which plan, and who pays for it. */
export function planCaption(status: ProStatus): string {
  const subscription = subscriptionOf(status)
  if (status.effective_source === 'subscription' && subscription) {
    return `Pro · pagado con ${storeName(subscription.store)}`
  }
  if (status.effective_source === 'organization' && gymsOf(status).length > 0) {
    return 'Pro · incluido por tu gimnasio'
  }
  return 'Gratis · sin costo'
}

/** The payments row's caption, which must not suggest a charge where there is none. */
export function paymentsCaption(status: ProStatus): string {
  const subscription = subscriptionOf(status)
  if (status.effective_source === 'organization' && !subscription) {
    return 'Sin pagos: tu plan viene del gimnasio'
  }
  return subscription
    ? `Tus cobros de Allfit Pro con ${storeName(subscription.store)}`
    : 'Tus cobros de Allfit Pro'
}

/** What a profile row ends in: it opens, it is not built yet, it is live, or nothing. */
export type ProfileRowEnd = 'open' | 'soon' | 'active' | 'none'

export type ProfileRowTrailing =
  | { readonly kind: 'chevron' }
  | { readonly kind: 'none' }
  | { readonly kind: 'badge'; readonly label: 'Pronto' }
  | {
      readonly kind: 'badge'
      readonly label: 'Activo'
      readonly tone: 'success'
      readonly variant: 'tonal'
      readonly dot: true
    }

/**
 * How a profile row is drawn with the design system's row. Only a row with somewhere
 * to go opens; the glyph is grey unless the row shows a figure, which lights it, or is
 * about pain, which is health data and stays red.
 */
export function profileRowLook({
  end,
  opens,
  value,
  alert,
}: {
  readonly end: ProfileRowEnd
  readonly opens: boolean
  readonly value?: string | undefined
  readonly alert?: boolean | undefined
}): {
  readonly opens: boolean
  readonly iconTone: 'quiet' | 'danger' | undefined
  readonly trailing: ProfileRowTrailing
} {
  const iconTone = alert ? 'danger' : value ? undefined : 'quiet'
  const live = end === 'open' && opens
  const trailing: ProfileRowTrailing = live
    ? { kind: 'chevron' }
    : end === 'soon'
      ? { kind: 'badge', label: 'Pronto' }
      : end === 'active'
        ? { kind: 'badge', label: 'Activo', tone: 'success', variant: 'tonal', dot: true }
        : { kind: 'none' }
  return { opens: live, iconTone, trailing }
}

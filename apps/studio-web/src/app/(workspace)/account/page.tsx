import { ProfessionalProfileScreen } from '@/components/professional-profile-screen'
import { accountTabFromQuery } from '@/lib/account-tabs'

/**
 * The account, opened on the section the address asks for.
 *
 * Read here rather than with `useSearchParams` in the screen, for the reason
 * the client directory gives: the Next docs prefer the page's own prop, and
 * the hook would push the whole client tree below the nearest Suspense
 * boundary into client-side rendering.
 *
 * **The `key` is what makes the address authoritative.** The screen keeps the
 * tab in state so the strip stays instant, and state ignores a prop that
 * changed — so arriving at `/account` from `/account?tab=spaces` would
 * otherwise reopen the spaces on a screen that was asked for no section at
 * all. Changing tabs inside the screen rewrites the address without a
 * navigation, so this page is not rendered again for that and the key holds.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const { tab } = await searchParams
  const asked = accountTabFromQuery(tab)

  return <ProfessionalProfileScreen key={asked ?? 'account'} initialTab={asked} />
}

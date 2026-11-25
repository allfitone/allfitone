import { TeamScreen } from '@/components/team-screen'
import { teamInviteFromQuery } from '@/lib/team-sections'

/**
 * The team. The screen reads its tab from the address itself, because it
 * changes the address without a navigation and this page is not rendered
 * again for that. What is read here is only a request to invite, which
 * arrives by navigation: the `key` makes a second request open the dialog
 * again, since the screen keeps that in state and state ignores a prop that
 * changed.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; new?: string | string[] }>
}) {
  const query = await searchParams
  const inviting = teamInviteFromQuery(query.new)

  return <TeamScreen key={inviting ? 'invite' : 'team'} initialInvite={inviting} />
}

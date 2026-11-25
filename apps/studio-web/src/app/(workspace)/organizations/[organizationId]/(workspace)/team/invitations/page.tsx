import { redirect } from 'next/navigation'

import { teamPath } from '@/lib/team-sections'

// The invitations are a tab of the team now; the old address opens it there.
export default async function TeamInvitationsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(teamPath(organizationId, 'invitations'))
}

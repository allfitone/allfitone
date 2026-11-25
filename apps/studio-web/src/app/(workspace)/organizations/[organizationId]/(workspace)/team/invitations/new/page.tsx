import { redirect } from 'next/navigation'

import { teamInvitePath } from '@/lib/team-sections'

// Inviting is a dialog over the invitations now; the old address opens it there.
export default async function NewTeamInvitationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(teamInvitePath(organizationId))
}

import { redirect } from 'next/navigation'

import { teamPath } from '@/lib/team-sections'

// Roles are a tab of the team now; the old address opens it there.
export default async function OrganizationRolesPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(teamPath(organizationId, 'roles'))
}

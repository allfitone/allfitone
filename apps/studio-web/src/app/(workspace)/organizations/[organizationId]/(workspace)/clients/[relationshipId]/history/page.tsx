import { redirect } from 'next/navigation'

import { relationshipPath } from '@/lib/client-directory'

// The history is a tab of the link now; the old address opens it there.
export default async function RelationshipHistoryPage({
  params,
}: {
  params: Promise<{ organizationId: string; relationshipId: string }>
}) {
  const { organizationId, relationshipId } = await params
  redirect(relationshipPath(organizationId, relationshipId, 'history'))
}

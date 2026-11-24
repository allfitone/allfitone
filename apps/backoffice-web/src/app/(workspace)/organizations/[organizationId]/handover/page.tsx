import { redirect } from 'next/navigation'

import { organizationFileHref } from '@/lib/organization-file'

// The handover is a tab of the gym's file now; the old address opens it there.
export default async function OrganizationHandoverPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(organizationFileHref(organizationId, 'handover'))
}

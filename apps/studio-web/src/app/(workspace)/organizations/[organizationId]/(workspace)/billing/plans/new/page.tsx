import { redirect } from 'next/navigation'

import { billingCreatePath } from '@/lib/billing-navigation'

// Creating a plan is a dialog over the plans now; the old address opens it there.
export default async function NewPlanPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(billingCreatePath(organizationId))
}

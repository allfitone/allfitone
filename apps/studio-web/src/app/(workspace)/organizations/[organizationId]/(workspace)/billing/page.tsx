import { OrganizationBilling } from '@/components/organization-billing'
import { billingCreateFromQuery, billingTabFromQuery } from '@/lib/billing-navigation'

/**
 * Cobros. The screen reads its tab from the address itself, as the library
 * does. What is read here is only a request to create a plan, which arrives by
 * navigation: the `key` makes a second request open its dialog again.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; new?: string | string[] }>
}) {
  const query = await searchParams
  const create = billingCreateFromQuery(query.new, billingTabFromQuery(query.tab))

  return <OrganizationBilling key={create ? 'create' : 'billing'} initialCreate={create} />
}

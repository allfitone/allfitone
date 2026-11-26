import { ClientsScreen } from '@/components/clients-screen'
import { clientFilterFromQuery } from '@/lib/client-directory'

/**
 * The clients. The screen reads its tab from the address itself, because it
 * changes the address without a navigation and this page is not rendered
 * again for that.
 *
 * What is read here is the directory's group, which arrives by navigation —
 * the workspace home links to `?status=invited`. The directory keeps that
 * filter in state so its toggle stays instant, and state ignores a prop that
 * changed, so the key is what makes the address authoritative for it.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[]; tab?: string | string[] }>
}) {
  const { status } = await searchParams

  return <ClientsScreen initialFilter={clientFilterFromQuery(status)} />
}

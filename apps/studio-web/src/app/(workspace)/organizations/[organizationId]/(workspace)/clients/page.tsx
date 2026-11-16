import { ClientDirectoryList } from '@/components/client-directory-list'
import { clientFilterFromQuery } from '@/lib/client-directory'

/**
 * The directory, opened on the group the URL asked for.
 *
 * Read here rather than with `useSearchParams` in the list: the Next docs
 * prefer the page's own prop, and the hook would push the whole client tree
 * below the nearest Suspense boundary into client-side rendering.
 *
 * **The `key` is what makes the URL authoritative.** The list keeps the filter
 * in state so the toggle stays instant, and state ignores a prop that changed —
 * so arriving at `/clients` from `/clients?status=invited` would otherwise show
 * every client under a screen still filtered to the invited ones.
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const { status } = await searchParams
  const filter = clientFilterFromQuery(status)

  return <ClientDirectoryList key={filter} initialFilter={filter} />
}

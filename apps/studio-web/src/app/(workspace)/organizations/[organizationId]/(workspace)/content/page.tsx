import { OrganizationContent } from '@/components/organization-content'
import { libraryCreateFromQuery, libraryTabFromQuery } from '@/lib/content-library'

/**
 * The library. The screen reads its tab from the address itself, because it
 * changes the address without a navigation and this page is not rendered again
 * for that. What is read here is only a request to create, which arrives by
 * navigation: the `key` makes a second request open its dialog, since the
 * screen keeps that in state and state ignores a prop that changed.
 */
export default async function OrganizationContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; new?: string | string[] }>
}) {
  const query = await searchParams
  const create = libraryCreateFromQuery(query.new, libraryTabFromQuery(query.tab))

  return <OrganizationContent key={create ?? 'library'} initialCreate={create} />
}

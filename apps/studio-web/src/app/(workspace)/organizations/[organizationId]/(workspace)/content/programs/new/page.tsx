import { redirect } from 'next/navigation'

import { libraryCreatePath } from '@/lib/content-library'

// Creating is a dialog over the library now; the old address opens it there.
export default async function NewProgramPage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  redirect(libraryCreatePath(organizationId, 'programs'))
}

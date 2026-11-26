import { redirect } from 'next/navigation'

import { clientsPath } from '@/lib/client-sections'

// The authorizations are a tab of the clients now; the old address opens it there.
export default async function Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params
  redirect(clientsPath(organizationId, 'authorizations'))
}

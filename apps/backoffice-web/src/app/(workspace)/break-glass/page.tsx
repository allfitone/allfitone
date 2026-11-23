import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BreakGlassWindows } from '@/components/break-glass-windows'

export const metadata: Metadata = {
  title: 'Acceso excepcional | Allfit Backoffice',
}

export default function BreakGlassPage() {
  return (
    // The request dialog reads its subject and case from the link, and the tab from the address.
    <Suspense>
      <BreakGlassWindows />
    </Suspense>
  )
}

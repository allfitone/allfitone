import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BreakGlassReviewQueue } from '@/components/break-glass-review-queue'
import { BreakGlassWindows } from '@/components/break-glass-windows'

export const metadata: Metadata = {
  title: 'Acceso excepcional · Allfit Backoffice',
}

export default function BreakGlassPage() {
  return (
    <>
      {/* The request form reads its subject and case from the link. */}
      <Suspense>
        <BreakGlassWindows />
      </Suspense>
      <BreakGlassReviewQueue />
    </>
  )
}

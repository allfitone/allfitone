import type { Metadata } from 'next'
import { Suspense } from 'react'

import { BillingFollowUp } from '@/components/billing-follow-up'

export const metadata: Metadata = {
  title: 'Cobros por seguir · Allfit Backoffice',
}

export default function BillingFollowUpPage() {
  return (
    <Suspense>
      <BillingFollowUp />
    </Suspense>
  )
}

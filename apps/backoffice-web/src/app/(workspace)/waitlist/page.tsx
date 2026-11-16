import type { Metadata } from 'next'

import { WaitlistReview } from '@/components/waitlist-review'

export const metadata: Metadata = {
  title: 'Lista de espera | Allfit Backoffice',
}

export default function WaitlistPage() {
  return <WaitlistReview />
}

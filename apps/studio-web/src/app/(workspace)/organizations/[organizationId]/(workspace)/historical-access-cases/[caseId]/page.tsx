import { Suspense } from 'react'

import { HistoricalCaseReading } from '@/components/historical-case-reading'

// The relationship travels as `?relationship=`, which a client component reads under Suspense.
export default function HistoricalCasePage() {
  return (
    <Suspense fallback={null}>
      <HistoricalCaseReading />
    </Suspense>
  )
}

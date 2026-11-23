import type { Metadata } from 'next'

import { AttentionPanel } from '@/components/attention-panel'
import { BusinessPanel } from '@/components/business-panel'
import { OperatorPanel } from '@/components/operator-panel'

export const metadata: Metadata = {
  title: 'Inicio | Allfit Backoffice',
}

/**
 * What needs attention first, because it asks somebody to act; how the business
 * is going next, refusing on its own without taking the screen down; the session
 * last. It used to come first, and pushed the notices below the fold of a page
 * whose point is them.
 */
export default function PanelPage() {
  return (
    <div data-panel-home>
      <AttentionPanel />
      <BusinessPanel />
      <OperatorPanel />
    </div>
  )
}

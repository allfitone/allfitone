import type { Metadata } from 'next'

import { AttentionPanel } from '@/components/attention-panel'
import { BusinessPanel } from '@/components/business-panel'
import { OperatorPanel } from '@/components/operator-panel'

export const metadata: Metadata = {
  title: 'Inicio · Allfit Backoffice',
}

/**
 * The session first, because it is the one thing every operator can read. What
 * needs attention comes next because it asks somebody to act; how the business
 * is going comes last and refuses on its own without taking the screen down.
 */
export default function PanelPage() {
  return (
    <div data-panel-home>
      <OperatorPanel />
      <AttentionPanel />
      <BusinessPanel />
    </div>
  )
}

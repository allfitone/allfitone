import type { Metadata } from 'next'

import { ResultContractPublication } from '@/components/result-contract-publication'

export const metadata: Metadata = {
  title: 'Reglas de resultados · Allfit Backoffice',
}

export default function ResultContractsPage() {
  return <ResultContractPublication />
}

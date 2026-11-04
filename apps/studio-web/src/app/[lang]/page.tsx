import { notFound } from 'next/navigation'

import { StudioLanding } from '@/components/studio-landing'
import { dictionaryFor } from '@/content'
import { isLocale } from '@/lib/locale'

/**
 * The public landing. It asks the API nothing, so the server paints it whole;
 * who is here is only asked at `/app`, once somebody asks to enter.
 */
export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  return <StudioLanding locale={lang} copy={dictionaryFor(lang)} />
}

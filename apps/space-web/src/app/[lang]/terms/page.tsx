import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LegalPage } from '@/components/legal-page'
import { dictionaryFor } from '@/content'
import type { LocaleParams } from '@/lib/route'
import { isLocale } from '@/lib/locale'
import { LEGAL_ROBOTS, pageMetadata } from '@/lib/site'

const PATH = '/terms'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  const { meta } = dictionaryFor(lang)
  return {
    ...pageMetadata(lang, PATH, { title: meta.termsTitle, description: meta.termsDescription }),
    robots: LEGAL_ROBOTS,
  }
}

export default async function Terms({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return <LegalPage locale={lang} copy={copy} document={copy.legal.terms} path={PATH} />
}

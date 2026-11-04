import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LegalPage } from '@/components/legal-page'
import { dictionaryFor } from '@/content'
import type { LocaleParams } from '@/lib/route'
import { isLocale } from '@/lib/locale'
import { LEGAL_ROBOTS, pageMetadata } from '@/lib/site'

const PATH = '/privacy'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  const { meta } = dictionaryFor(lang)
  return {
    ...pageMetadata(lang, PATH, { title: meta.privacyTitle, description: meta.privacyDescription }),
    robots: LEGAL_ROBOTS,
  }
}

export default async function Privacy({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return <LegalPage locale={lang} copy={copy} document={copy.legal.privacy} path={PATH} />
}

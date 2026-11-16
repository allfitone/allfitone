/** `/{lang}/waitlist/confirm#token=…`: the link in the confirmation email (OP-WL-002). */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LinkPage } from '@/components/link-page'
import { ConfirmEmail } from '@/components/waitlist-links'
import { dictionaryFor } from '@/content'
import { isLocale } from '@/lib/locale'
import type { LocaleParams } from '@/lib/route'
import { privatePageMetadata } from '@/lib/site'
import { CONFIRM_PATH } from '@/lib/waitlist'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  return privatePageMetadata(lang, CONFIRM_PATH, dictionaryFor(lang).linkPages.confirm.meta)
}

export default async function ConfirmPage({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return (
    <LinkPage locale={lang} copy={copy} path={CONFIRM_PATH}>
      <ConfirmEmail locale={lang} copy={copy.linkPages} form={copy.form} />
    </LinkPage>
  )
}

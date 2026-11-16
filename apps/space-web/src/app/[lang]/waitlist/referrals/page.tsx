/** `/{lang}/waitlist/referrals#token=…`: «mi link», in every waitlist email (OP-WL-004). */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LinkPage } from '@/components/link-page'
import { ReferralsLink } from '@/components/waitlist-links'
import { dictionaryFor } from '@/content'
import { isLocale } from '@/lib/locale'
import type { LocaleParams } from '@/lib/route'
import { privatePageMetadata } from '@/lib/site'
import { REFERRALS_PATH } from '@/lib/waitlist'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  return privatePageMetadata(lang, REFERRALS_PATH, dictionaryFor(lang).linkPages.referrals.meta)
}

export default async function ReferralsPage({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return (
    <LinkPage locale={lang} copy={copy} path={REFERRALS_PATH}>
      <ReferralsLink
        locale={lang}
        copy={copy.linkPages}
        form={copy.form}
        rewards={copy.referrals.rewards}
        newWindow={copy.footer.newWindow}
      />
    </LinkPage>
  )
}

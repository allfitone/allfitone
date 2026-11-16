/** `/{lang}/waitlist/leave#token=…`: leaving the list, from every waitlist email (OP-WL-005). */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { LinkPage } from '@/components/link-page'
import { LeaveWaitlist } from '@/components/waitlist-links'
import { dictionaryFor } from '@/content'
import { isLocale } from '@/lib/locale'
import type { LocaleParams } from '@/lib/route'
import { privatePageMetadata } from '@/lib/site'
import { LEAVE_PATH } from '@/lib/waitlist'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  return privatePageMetadata(lang, LEAVE_PATH, dictionaryFor(lang).linkPages.leave.meta)
}

export default async function LeavePage({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return (
    <LinkPage locale={lang} copy={copy} path={LEAVE_PATH}>
      <LeaveWaitlist locale={lang} copy={copy.linkPages} form={copy.form} />
    </LinkPage>
  )
}

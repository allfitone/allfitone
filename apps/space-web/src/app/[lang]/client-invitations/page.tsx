/** `/{lang}/client-invitations#token=…`: the link of a client invitation email (TECH-360). */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ClientInvitationLink } from '@/components/client-invitation-link'
import { LinkPage } from '@/components/link-page'
import { dictionaryFor } from '@/content'
import { CLIENT_INVITATION_PATH } from '@/lib/client-invitation'
import { isLocale } from '@/lib/locale'
import type { LocaleParams } from '@/lib/route'
import { privatePageMetadata } from '@/lib/site'

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  return privatePageMetadata(lang, CLIENT_INVITATION_PATH, dictionaryFor(lang).invitationLink.meta)
}

export default async function ClientInvitationPage({ params }: LocaleParams) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const copy = dictionaryFor(lang)
  return (
    <LinkPage locale={lang} copy={copy} path={CLIENT_INVITATION_PATH}>
      <ClientInvitationLink locale={lang} copy={copy.invitationLink} stores={copy.stores} />
    </LinkPage>
  )
}

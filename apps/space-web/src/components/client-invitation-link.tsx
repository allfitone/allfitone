'use client'

/**
 * What a client invitation email opens (TECH-360). On a phone, one button hands the token
 * to Allfit Space; the app opens on that tap and never by itself, because Safari shows an
 * error when a page tries to open an app that is not installed. On a computer, it says to
 * open the email on the phone. Without a token, it says the link arrived cut short.
 *
 * The outcome is the panel's heading, so a screen reader announces where she is.
 */

import { buttonVariants } from '@allfitone/react/components/button'
import Link from 'next/link'
import { useSyncExternalStore } from 'react'

import { Stores } from '@/components/stores'
import type { Dictionary } from '@/content'
import { appLink, canOpenApp } from '@/lib/client-invitation'
import { useLinkToken } from '@/lib/link-token'
import type { Locale } from '@/lib/locale'

type Copy = Dictionary['invitationLink']

const noUpdates = () => () => undefined
const unread = () => undefined
const thisDevice = () => canOpenApp(navigator.userAgent, navigator.maxTouchPoints)

export function ClientInvitationLink({
  locale,
  copy,
  stores,
}: {
  locale: Locale
  copy: Copy
  stores: Dictionary['stores']
}) {
  const token = useLinkToken('invitation')
  const phone = useSyncExternalStore(noUpdates, thisDevice, unread)

  if (token === undefined || phone === undefined) {
    return (
      <div className="link-panel" aria-busy>
        <h1 className="joined__title">{copy.opening}</h1>
      </div>
    )
  }

  if (token === null) {
    return (
      <div className="link-panel">
        <h1 className="joined__title">{copy.invalidTitle}</h1>
        <p className="joined__body">{copy.invalidBody}</p>
        <div className="link-panel__actions">
          <Link className={buttonVariants({ variant: 'outline', size: 'lg' })} href={`/${locale}`}>
            {copy.home}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="link-panel">
      <h1 className="joined__title">{phone ? copy.phoneTitle : copy.computerTitle}</h1>
      <p className="joined__body">{phone ? copy.phoneBody : copy.computerBody}</p>
      {phone ? (
        <a
          className={`${buttonVariants({ size: 'lg' })} invitation-link__open`}
          href={appLink(token)}
        >
          {copy.open}
        </a>
      ) : null}
      <div className="invitation-link__install">
        <p className="joined__body">
          <strong>{copy.noAppTitle}</strong> {phone ? copy.noAppBody : copy.computerNoAppBody}
        </p>
        <Stores copy={stores} />
      </div>
      <p className="invitation-link__fine">{phone ? copy.expiry : copy.computerExpiry}</p>
    </div>
  )
}

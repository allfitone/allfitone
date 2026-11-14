'use client'

/**
 * What a person gets once they join: their code, set large so it can be read
 * aloud, their link with a copy action, WhatsApp as the main way to share it
 * (with the message prefilled) and, where the device has one, its own share
 * sheet. Below, the count: how many people signed up through them, and what
 * makes a referral count for rewards. A sign-up is not progress toward a level
 * (launch strategy v1.2): the steps return with the active count, TECH-334.
 */

import { FoundationIcon } from '@allfitone/react/icons'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import type { Dictionary } from '@/content'
import type { Locale } from '@/lib/locale'
import { referralLink, whatsappShareUrl } from '@/lib/waitlist'

const noUpdates = () => () => undefined
const canShareNatively = () => typeof navigator.share === 'function'
const cannotShare = () => false

export function WaitlistShare({
  locale,
  copy,
  newWindow,
  code,
  referrals,
}: {
  locale: Locale
  copy: Dictionary['form']
  newWindow: string
  code: string
  referrals: number
}) {
  const link = referralLink(locale, code)
  const message = copy.shareMessage.replace('{link}', link)
  const canShare = useSyncExternalStore(noUpdates, canShareNatively, cannotShare)
  const [copied, setCopied] = useState(false)
  const linkRef = useRef<HTMLParagraphElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Without clipboard access the link is selected, ready for the keyboard shortcut.
      if (linkRef.current) window.getSelection()?.selectAllChildren(linkRef.current)
      return
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2400)
  }

  async function share() {
    try {
      await navigator.share({ text: message })
    } catch {
      // Closing the share sheet rejects; there is nothing to recover.
    }
  }

  return (
    <div className="share">
      <div>
        <p className="field__label" id={`${id}-code`}>
          {copy.codeLabel}
        </p>
        <p className="share__code" aria-labelledby={`${id}-code`}>
          {code}
        </p>
      </div>

      <div>
        <p className="field__label" id={`${id}-link`}>
          {copy.linkLabel}
        </p>
        <div className="share__link">
          {/* Written out whole, wrapping if it must: the code at its end is the part
              that counts, and a field would cut it off. */}
          <p ref={linkRef} className="share__link-text" aria-labelledby={`${id}-link`}>
            {link.replace(/^https:\/\//, '')}
          </p>
          <button type="button" className="pill-link share__copy" onClick={copyLink}>
            <FoundationIcon name={copied ? 'check' : 'duplicate'} size="sm" decorative />
            {copied ? copy.copied : copy.copy}
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? copy.copiedAnnouncement : ''}
        </p>
      </div>

      <div className="share__actions">
        <a
          className="cta"
          href={whatsappShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {copy.whatsapp}
          <FoundationIcon name="external" size="sm" decorative />
          <span className="sr-only"> {newWindow}</span>
        </a>
        {canShare ? (
          <button type="button" className="pill-link" onClick={share}>
            <FoundationIcon name="share" size="sm" decorative />
            {copy.share}
          </button>
        ) : null}
      </div>

      <div className="share__count">
        <p className="share__count-total">
          {copy.registered.replace('{count}', String(referrals))}
        </p>
        <p className="share__count-rule">{copy.rewardRule}</p>
      </div>
    </div>
  )
}

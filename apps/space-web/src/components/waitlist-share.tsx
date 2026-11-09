'use client'

/**
 * What a person gets once they join: their code, set large so it can be read
 * aloud, their link with a copy action, WhatsApp as the main way to share it
 * (with the message prefilled) and, where the device has one, its own share
 * sheet. Below, the counter: how many people joined through them and how many
 * the next level takes, drawn as the set marks of the app's session screen.
 */

import { FoundationIcon } from '@allfitone/react/icons'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import type { Dictionary } from '@/content'
import type { Locale } from '@/lib/locale'
import {
  nextReferralLevel,
  reachedReferralLevel,
  referralLink,
  whatsappShareUrl,
} from '@/lib/waitlist'

const noUpdates = () => () => undefined
const canShareNatively = () => typeof navigator.share === 'function'
const cannotShare = () => false

/** Above this many steps to the next level, the counter draws one bar instead of marks. */
const MAX_MARKS = 15

export function WaitlistShare({
  locale,
  copy,
  rewards,
  newWindow,
  code,
  referrals,
}: {
  locale: Locale
  copy: Dictionary['form']
  rewards: Dictionary['referrals']['rewards']
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

  const next = nextReferralLevel(referrals)
  const floor = reachedReferralLevel(referrals)
  const steps = next === null ? 0 : next - floor
  const done = next === null ? 0 : referrals - floor
  const progress =
    next === null
      ? copy.progressDone.replace('{count}', String(referrals))
      : copy.progress
          .replace('{count}', String(referrals))
          .replace('{goal}', String(next))
          .replace('{reward}', rewards[next])

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

      <div className="progress">
        {steps > 0 ? (
          steps <= MAX_MARKS ? (
            <span className="progress__marks" aria-hidden="true">
              {Array.from({ length: steps }, (_, index) => (
                <span
                  key={index}
                  className="progress__mark"
                  data-done={index < done ? '' : undefined}
                />
              ))}
            </span>
          ) : (
            <span className="progress__bar" aria-hidden="true">
              <span style={{ width: `${String((done / steps) * 100)}%` }} />
            </span>
          )
        ) : null}
        <p className="progress__text">{progress}</p>
      </div>
    </div>
  )
}

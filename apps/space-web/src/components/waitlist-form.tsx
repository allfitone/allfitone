'use client'

/**
 * The Allfit Space waitlist form, on the landing and the waitlist page: a first
 * name, an email and the authorization to process them (Ley 1581 de 2012), with
 * the privacy policy one click away. A visitor who arrived through someone's
 * link sees whose code they join with.
 *
 * Validation runs on submit; the browser's own bubbles are off so the messages
 * follow the page language. Every missing field is marked under itself, only
 * the first is announced, and it takes the keyboard. Joined, the form gives way
 * to the person's code, link and share actions (`WaitlistShare`), and the
 * confirmation takes focus so it is announced. An address already on the list
 * gets neither code nor counter on screen: they go to its inbox, which only its
 * owner reads. «Usar otro correo» brings the form back with the name kept.
 *
 * A disposable address is marked under the email field; too many attempts from
 * one connection, or any other failure, under the button.
 */

import { FoundationIcon } from '@allfitone/react/icons'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { around } from '@/components/text'
import { WaitlistShare } from '@/components/waitlist-share'
import type { Dictionary } from '@/content'
import { legalUrl } from '@/lib/legal'
import type { Locale } from '@/lib/locale'
import { useCampaign, useReferralCode } from '@/lib/referral'
import { CONTACT_EMAIL } from '@/lib/site'
import {
  isPlausibleEmail,
  joinWaitlist,
  WaitlistRequestError,
  type WaitlistJoinResult,
} from '@/lib/waitlist'

type Status = 'idle' | 'pending' | 'joined' | 'failed' | 'rate-limited'
type Field = 'name' | 'email' | 'consent'
type Errors = Partial<Record<Field, string>>

const FIELD_ORDER: readonly Field[] = ['name', 'email', 'consent']

export function WaitlistForm({
  locale,
  copy,
  rewards,
  newWindow,
}: {
  locale: Locale
  copy: Dictionary['form']
  rewards: Dictionary['referrals']['rewards']
  newWindow: string
}) {
  const referredBy = useReferralCode()
  const campaign = useCampaign()
  const [status, setStatus] = useState<Status>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const [announced, setAnnounced] = useState<Field | null>(null)
  const [joined, setJoined] = useState<
    (WaitlistJoinResult & { name: string; email: string }) | null
  >(null)
  const [keptName, setKeptName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const joinedRef = useRef<HTMLParagraphElement>(null)
  const focusNext = useRef<Field | null>(null)
  const id = useId()
  const fieldId = (field: Field) => `${id}-${field}`
  const errorId = (field: Field) => `${id}-${field}-error`
  const failedId = `${id}-failed`
  const referredId = `${id}-referred`

  // Focus moves only once the swapped block or the error exists, so it waits for the render.
  useEffect(() => {
    if (status === 'joined') {
      joinedRef.current?.focus()
      return
    }
    const field = focusNext.current
    if (!field) return
    focusNext.current = null
    const target = { name: nameRef, email: emailRef, consent: consentRef }[field]
    target.current?.focus()
  }, [status, errors])

  function clearError(field: Field) {
    if (!errors[field]) return
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
    if (announced === field) setAnnounced(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === 'pending') return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const consent = data.get('consent') === 'yes'

    const next: Errors = {}
    if (!name) next.name = copy.errorNameEmpty
    if (!email) next.email = copy.errorEmailEmpty
    else if (!isPlausibleEmail(email)) next.email = copy.errorEmailInvalid
    if (!consent) next.consent = copy.errorConsent

    const first = FIELD_ORDER.find((field) => next[field])
    if (first) {
      focusNext.current = first
      setErrors(next)
      setAnnounced(first)
      setStatus('idle')
      return
    }

    setErrors({})
    setAnnounced(null)
    setStatus('pending')
    try {
      const result = await joinWaitlist({
        name,
        email,
        consent: true,
        referredBy,
        campaign,
        locale,
      })
      setJoined({ ...result, name, email })
      setStatus('joined')
    } catch (error) {
      const reason = error instanceof WaitlistRequestError ? error.reason : 'unavailable'
      if (reason === 'disposable-email') {
        focusNext.current = 'email'
        setErrors({ email: copy.errorEmailDisposable })
        setAnnounced('email')
        setStatus('idle')
        return
      }
      setStatus(reason === 'rate-limited' ? 'rate-limited' : 'failed')
    }
  }

  function reset() {
    if (joined) setKeptName(joined.name)
    focusNext.current = 'email'
    setErrors({})
    setAnnounced(null)
    setStatus('idle')
  }

  if (status === 'joined' && joined) {
    const listed = joined.status === 'already_listed'
    return (
      <div className="joined">
        <div role="status">
          <p ref={joinedRef} tabIndex={-1} className="joined__title">
            {(listed ? copy.listedTitle : copy.joinedTitle).replace('{name}', joined.name)}
          </p>
          <p className="joined__body">
            {around(
              listed ? copy.listedBody : copy.joinedBody,
              'email',
              <strong>{joined.email}</strong>,
            )}
          </p>
        </div>
        {joined.status === 'joined' ? (
          <WaitlistShare
            locale={locale}
            copy={copy}
            rewards={rewards}
            newWindow={newWindow}
            code={joined.code}
            referrals={joined.referrals}
          />
        ) : null}
        <button type="button" className="text-button" onClick={reset}>
          {copy.reset}
        </button>
      </div>
    )
  }

  const pending = status === 'pending'
  const failed = status === 'failed' || status === 'rate-limited'
  const describedBy = (field: Field) => (errors[field] ? errorId(field) : undefined)

  const fieldMessage = (field: Field) =>
    errors[field] ? (
      <p
        id={errorId(field)}
        className="field__error"
        role={announced === field ? 'alert' : undefined}
      >
        <FoundationIcon name="error" size="sm" decorative />
        {errors[field]}
      </p>
    ) : null

  // «… según su [política de privacidad].»: the bracketed words are the link.
  const [, consentBefore = '', consentLink = '', consentAfter = ''] =
    /^(.*)\[(.*)\](.*)$/.exec(copy.consent) ?? []

  return (
    <form className="join-form" noValidate onSubmit={submit} aria-busy={pending}>
      <div className="join-form__fields">
        <div className="field">
          <label htmlFor={fieldId('name')} className="field__label">
            {copy.nameLabel}
          </label>
          <input
            ref={nameRef}
            id={fieldId('name')}
            className="field__input"
            name="name"
            type="text"
            autoComplete="given-name"
            autoCapitalize="words"
            maxLength={80}
            defaultValue={keptName}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name')}
            readOnly={pending}
            onChange={() => clearError('name')}
          />
          {fieldMessage('name')}
        </div>

        <div className="field">
          <label htmlFor={fieldId('email')} className="field__label">
            {copy.emailLabel}
          </label>
          <input
            ref={emailRef}
            id={fieldId('email')}
            className="field__input"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy('email')}
            readOnly={pending}
            onChange={() => clearError('email')}
          />
          {fieldMessage('email')}
        </div>
      </div>

      {/* A native checkbox under a drawn box: the label toggles it, and the policy
          link inside the label opens without toggling it. */}
      <div className="consent">
        <label className="consent__label">
          <span className="consent__box">
            <input
              ref={consentRef}
              type="checkbox"
              name="consent"
              value="yes"
              aria-invalid={Boolean(errors.consent)}
              aria-describedby={describedBy('consent')}
              disabled={pending}
              onChange={() => clearError('consent')}
            />
            <FoundationIcon name="check" size="sm" className="consent__mark" decorative />
          </span>
          <span>
            {consentBefore}
            <a
              className="consent__link"
              href={legalUrl(locale, 'privacy')}
              target="_blank"
              rel="noopener noreferrer"
            >
              {consentLink}
              <span className="sr-only"> {newWindow}</span>
            </a>
            {consentAfter}
          </span>
        </label>
        {fieldMessage('consent')}
      </div>

      {referredBy ? (
        <p id={referredId} className="join-form__referred">
          <FoundationIcon name="people" size="sm" decorative />
          <span>{around(copy.referredBy, 'code', <strong>{referredBy}</strong>)}</span>
        </p>
      ) : null}

      <button
        type="submit"
        className="cta join-form__submit"
        disabled={pending}
        aria-describedby={
          [failed ? failedId : null, referredBy ? referredId : null].filter(Boolean).join(' ') ||
          undefined
        }
      >
        {pending ? (
          <>
            <FoundationIcon name="loading" size="sm" className="spin" decorative />
            {copy.pending}
          </>
        ) : (
          <>
            {copy.submit}
            <FoundationIcon name="forward" size="sm" decorative />
          </>
        )}
      </button>

      {failed ? (
        <p id={failedId} className="field__error" role="alert">
          <FoundationIcon name="error" size="sm" decorative />
          <span>
            {status === 'rate-limited'
              ? copy.rateLimited
              : around(
                  copy.failed,
                  'email',
                  <a className="consent__link" href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                  </a>,
                )}
          </span>
        </p>
      ) : null}
    </form>
  )
}

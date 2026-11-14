'use client'

/**
 * The three pages the waitlist emails link to: confirming the email, «mi link» and
 * leaving the list. Each reads its token from the fragment (`useLinkToken`) and posts it
 * through this app's server; none shows anything about the person before the API has
 * recognised the token.
 *
 * Confirming posts as soon as the page opens: opening the link is the action. Leaving
 * never does: it asks first, because the API deletes the sign-up and nothing brings it
 * back. A link the API does not recognise gets one answer whatever the reason (cut short,
 * expired, voided by a newer email, or its owner left), with the way to ask for a new one.
 *
 * Every outcome is the panel's heading and takes focus, so a screen reader announces it.
 */

import { FoundationIcon } from '@allfitone/react/icons'
import Link from 'next/link'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { around } from '@/components/text'
import { WaitlistShare } from '@/components/waitlist-share'
import type { Dictionary } from '@/content'
import { forgetLinkToken, useLinkToken } from '@/lib/link-token'
import type { Locale } from '@/lib/locale'
import { CONTACT_EMAIL } from '@/lib/site'
import {
  confirmWaitlistEmail,
  isPlausibleEmail,
  LEAVE_PATH,
  leaveWaitlist,
  readWaitlistLink,
  REFERRALS_PATH,
  requestWaitlistEmail,
  WAITLIST_PATH,
  WaitlistRequestError,
  type WaitlistFailureReason,
  type WaitlistLink,
} from '@/lib/waitlist'

type Copy = Dictionary['linkPages']
type Failed = { failed: WaitlistFailureReason }

interface PageProps {
  locale: Locale
  copy: Copy
  form: Dictionary['form']
}

function reasonOf(error: unknown): WaitlistFailureReason {
  return error instanceof WaitlistRequestError ? error.reason : 'unavailable'
}

const isFailed = (state: unknown): state is Failed =>
  typeof state === 'object' && state !== null && 'failed' in state

function Panel({
  title,
  busy = false,
  children,
}: {
  title: string
  busy?: boolean
  children?: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [title])

  return (
    <div className="link-panel" aria-busy={busy}>
      <h1 ref={heading} tabIndex={-1} className="joined__title">
        {title}
      </h1>
      {children}
    </div>
  )
}

function ContactLink() {
  return (
    <a className="consent__link" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  )
}

function FailurePanel({
  copy,
  reason,
  onRetry,
}: {
  copy: Copy
  reason: WaitlistFailureReason
  onRetry: () => void
}) {
  const limited = reason === 'rate-limited'
  return (
    <Panel title={copy.failedTitle}>
      <p className="joined__body">
        {limited ? copy.rateLimited : around(copy.failedBody, 'email', <ContactLink />)}
      </p>
      {limited ? null : (
        <div className="link-panel__actions">
          <button type="button" className="pill-link" onClick={onRetry}>
            {copy.retry}
          </button>
        </div>
      )}
    </Panel>
  )
}

/** A link the API did not recognise, and the way to get a new one by email. */
function InvalidLink({ copy, form }: { copy: Copy; form: Dictionary['form'] }) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'sent' | Failed>('idle')
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const pending = status === 'pending'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const value = String(new FormData(event.currentTarget).get('email') ?? '').trim()
    const problem = !value
      ? copy.invalid.emailEmpty
      : isPlausibleEmail(value)
        ? null
        : form.errorEmailInvalid
    if (problem) {
      setError(problem)
      input.current?.focus()
      return
    }
    setError(null)
    setStatus('pending')
    try {
      await requestWaitlistEmail(value)
      setEmail(value)
      setStatus('sent')
    } catch (failure) {
      setStatus({ failed: reasonOf(failure) })
    }
  }

  if (status === 'sent') {
    return (
      <Panel title={copy.invalid.sentTitle}>
        <p className="joined__body">
          {around(copy.invalid.sentBody, 'email', <strong>{email}</strong>)}
        </p>
      </Panel>
    )
  }

  return (
    <Panel title={copy.invalid.title}>
      <p className="joined__body">{copy.invalid.body}</p>
      <form className="join-form" noValidate onSubmit={submit} aria-busy={pending}>
        <div className="field">
          <label htmlFor={`${id}-email`} className="field__label">
            {form.emailLabel}
          </label>
          <input
            ref={input}
            id={`${id}-email`}
            className="field__input"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            readOnly={pending}
            onChange={() => setError(null)}
          />
          {error ? (
            <p id={`${id}-error`} className="field__error" role="alert">
              <FoundationIcon name="error" size="sm" decorative />
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" className="cta join-form__submit" disabled={pending}>
          {pending ? (
            <>
              <FoundationIcon name="loading" size="sm" className="spin" decorative />
              {form.pending}
            </>
          ) : (
            copy.invalid.submit
          )}
        </button>
        {isFailed(status) ? (
          <p className="field__error" role="alert">
            <FoundationIcon name="error" size="sm" decorative />
            <span>
              {status.failed === 'rate-limited'
                ? copy.rateLimited
                : around(copy.failedBody, 'email', <ContactLink />)}
            </span>
          </p>
        ) : null}
      </form>
    </Panel>
  )
}

/**
 * Sends a token once per attempt. React runs effects twice in development, and a second
 * confirmation would turn «confirmed» into «already confirmed» on screen.
 */
function useOncePerAttempt(
  token: string | null | undefined,
  attempt: number,
  send: (token: string) => void,
) {
  const sent = useRef<string | null>(null)
  useEffect(() => {
    if (!token) return
    const key = `${token}:${String(attempt)}`
    if (sent.current === key) return
    sent.current = key
    send(token)
  }, [token, attempt, send])
}

type ConfirmState = 'pending' | 'confirmed' | 'already_confirmed' | 'invalid' | Failed

export function ConfirmEmail({ locale, copy, form }: PageProps) {
  const token = useLinkToken('confirmation')
  const [state, setState] = useState<ConfirmState>('pending')
  const [attempt, setAttempt] = useState(0)
  const send = useRef((value: string) => {
    confirmWaitlistEmail(value).then(setState, (error: unknown) => {
      setState({ failed: reasonOf(error) })
    })
  })
  useOncePerAttempt(token, attempt, send.current)

  if (token === undefined) return <Panel title={copy.checking} busy />
  if (token === null || state === 'invalid') return <InvalidLink copy={copy} form={form} />
  if (state === 'pending') return <Panel title={copy.confirm.pending} busy />
  if (isFailed(state)) {
    return (
      <FailurePanel
        copy={copy}
        reason={state.failed}
        onRetry={() => {
          setState('pending')
          setAttempt((current) => current + 1)
        }}
      />
    )
  }

  const confirmed = state === 'confirmed'
  return (
    <Panel title={confirmed ? copy.confirm.confirmedTitle : copy.confirm.alreadyTitle}>
      <p className="joined__body">
        {confirmed ? copy.confirm.confirmedBody : copy.confirm.alreadyBody}
      </p>
      <div className="link-panel__actions">
        <Link className="pill-link" href={`/${locale}`}>
          {copy.home}
        </Link>
      </div>
    </Panel>
  )
}

type ReferralsState = 'loading' | 'invalid' | WaitlistLink | Failed

export function ReferralsLink({
  locale,
  copy,
  form,
  newWindow,
}: PageProps & { newWindow: string }) {
  const token = useLinkToken('private')
  const [state, setState] = useState<ReferralsState>('loading')
  const [attempt, setAttempt] = useState(0)
  const send = useRef((value: string) => {
    readWaitlistLink(value).then(setState, (error: unknown) => {
      setState({ failed: reasonOf(error) })
    })
  })
  useOncePerAttempt(token, attempt, send.current)

  if (token === undefined) return <Panel title={copy.checking} busy />
  if (token === null || state === 'invalid') return <InvalidLink copy={copy} form={form} />
  if (state === 'loading') return <Panel title={copy.checking} busy />
  if (isFailed(state)) {
    return (
      <FailurePanel
        copy={copy}
        reason={state.failed}
        onRetry={() => {
          setState('loading')
          setAttempt((current) => current + 1)
        }}
      />
    )
  }

  return (
    <Panel title={copy.referrals.title}>
      <p className="joined__body">{copy.referrals.body}</p>
      {state.confirmed ? null : (
        <div className="link-notice" role="note">
          <p className="link-notice__title">{copy.referrals.unconfirmedTitle}</p>
          <p>{copy.referrals.unconfirmedBody}</p>
        </div>
      )}
      <WaitlistShare
        locale={locale}
        copy={form}
        newWindow={newWindow}
        code={state.code}
        referrals={state.referrals}
      />
      <Link className="text-button" href={`/${locale}${LEAVE_PATH}`}>
        {copy.referrals.leave}
      </Link>
    </Panel>
  )
}

type LeaveState = 'ask' | 'pending' | 'left' | 'invalid' | Failed

export function LeaveWaitlist({ locale, copy, form }: PageProps) {
  const token = useLinkToken('private')
  const [state, setState] = useState<LeaveState>('ask')

  async function leave() {
    if (!token || state === 'pending') return
    setState('pending')
    try {
      const outcome = await leaveWaitlist(token)
      if (outcome === 'left') forgetLinkToken('private')
      setState(outcome)
    } catch (error) {
      setState({ failed: reasonOf(error) })
    }
  }

  // Leaving forgets the token, so this outcome has to come before the missing-token check.
  if (state === 'left') {
    return (
      <Panel title={copy.leave.leftTitle}>
        <p className="joined__body">{copy.leave.leftBody}</p>
        <div className="link-panel__actions">
          <Link className="pill-link" href={`/${locale}${WAITLIST_PATH}`}>
            {copy.leave.join}
          </Link>
        </div>
      </Panel>
    )
  }
  if (token === undefined) return <Panel title={copy.checking} busy />
  if (token === null || state === 'invalid') return <InvalidLink copy={copy} form={form} />
  if (isFailed(state)) {
    return <FailurePanel copy={copy} reason={state.failed} onRetry={() => setState('ask')} />
  }

  const pending = state === 'pending'
  return (
    <Panel title={copy.leave.title} busy={pending}>
      <p className="joined__body">{copy.leave.body}</p>
      <div className="link-panel__actions">
        <button type="button" className="cta cta--danger" disabled={pending} onClick={leave}>
          {pending ? (
            <>
              <FoundationIcon name="loading" size="sm" className="spin" decorative />
              {copy.leave.pending}
            </>
          ) : (
            copy.leave.submit
          )}
        </button>
        <Link className="text-button" href={`/${locale}${REFERRALS_PATH}`}>
          {copy.leave.stay}
        </Link>
      </div>
    </Panel>
  )
}

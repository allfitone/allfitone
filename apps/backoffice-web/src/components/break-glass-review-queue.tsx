'use client'

/**
 * `OP-SUP-006` — the cases that were used and still owe a review.
 *
 * **This is a debt, drawn as one.** The oldest unreviewed case is at the top and the
 * backlog is counted in the heading, because a reviewer who reads this as an inbox
 * works the newest first and that is the wrong end of a queue of obligations.
 *
 * **An overdue case keeps its buttons.** The deadline makes the delay visible; it does
 * not void the obligation. Greying out a late case would turn a backlog into a
 * permanent hole in the audit, which is the outcome the twenty-four hours exist to
 * prevent.
 *
 * **Each verdict says what it means before it is chosen.** Three buttons that read
 * as a severity scale would make `incident_opened` the angry option; it is not a worse
 * verdict, it is the one that asks somebody to act. So a verdict is chosen among
 * equals, each with its meaning, and only one button registers it: a stray click on
 * three filled buttons in a row used to decide a case.
 *
 * **A lost answer never decides twice.** The command is kept until an answer arrives,
 * so a retry after a network failure replays instead of writing a second verdict over
 * a case that already has one.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@allfitone/react/components/field'
import { RadioGroup, RadioGroupItem } from '@allfitone/react/components/radio-group'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type BackofficeCommand,
  type BreakGlassReview,
  type BreakGlassReviewOutcome,
} from '@/lib/backoffice-api'
import {
  LATE_IS_STILL_REQUIRED,
  REVIEW_OUTCOMES,
  WHY_IT_IS_REVIEWED,
  backlogSentence,
  debtSentence,
  dueSentence,
  outcomeLabel,
  outcomeMeaning,
  queueOrder,
  reviewBadge,
  reviewMessage,
  reviewOutcomeMessage,
} from '@/lib/break-glass-review'
import { categoryLabel } from '@/lib/break-glass'
import { formatInstant } from '@/lib/platform-access'

export function BreakGlassReviewQueue() {
  const [reviews, setReviews] = useState<BreakGlassReview[] | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const pending = useRef(new Map<string, BackofficeCommand>())

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const page = await backofficeApi.breakGlassReviewQueue(signal)
      setReviews(page.items)
      setRefused(null)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setRefused(
        error instanceof BackofficeNetworkError
          ? reviewMessage('network-unavailable')
          : reviewMessage(error instanceof BackofficeApiError ? error.code : 'unknown'),
      )
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function review(requestId: string, verdict: BreakGlassReviewOutcome) {
    const command = pending.current.get(requestId) ?? newBackofficeCommand()
    pending.current.set(requestId, command)
    setBusy(requestId)
    setFailure(null)
    setOutcome(null)
    try {
      const reviewed = await backofficeApi.reviewBreakGlass(requestId, verdict, command)
      pending.current.delete(requestId)
      setReviews((current) =>
        (current ?? []).map((entry) => (entry.request_id === requestId ? reviewed : entry)),
      )
      setOutcome(reviewOutcomeMessage(reviewed))
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setFailure(
        error instanceof BackofficeNetworkError
          ? reviewMessage('network-unavailable')
          : reviewMessage(error instanceof BackofficeApiError ? error.code : 'unknown'),
      )
    } finally {
      setBusy(null)
    }
  }

  if (refused) {
    return (
      <Alert live="assertive" variant="danger" data-review-refused>
        <AlertTitle>No se pudo leer la cola de revisión</AlertTitle>
        <AlertDescription>{refused}</AlertDescription>
      </Alert>
    )
  }

  if (reviews === null) return null

  const now = new Date()
  const ordered = queueOrder(reviews)

  return (
    <div data-review-queue>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Revisión de accesos excepcionales
          </CardTitle>
          <CardDescription data-review-backlog>{backlogSentence(reviews)}</CardDescription>
        </CardHeader>
        <CardContent data-card-body>
          <p data-review-why>{WHY_IT_IS_REVIEWED}</p>
          <p data-review-late-note>{LATE_IS_STILL_REQUIRED}</p>
        </CardContent>
      </Card>

      {outcome ? (
        <Alert live="polite" variant="success" data-review-outcome>
          <AlertTitle>Revisión registrada</AlertTitle>
          <AlertDescription>{outcome}</AlertDescription>
        </Alert>
      ) : null}

      {failure ? (
        <Alert live="assertive" variant="danger" data-review-failure>
          <AlertTitle>No se pudo registrar</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      {ordered.map((entry) => {
        const badge = reviewBadge(entry)
        return (
          <Card
            key={entry.request_id}
            data-review-case={entry.case_reference}
            data-overdue={String(entry.overdue)}
          >
            <CardHeader>
              <CardTitle role="heading" aria-level={3}>
                {entry.case_reference}
              </CardTitle>
              <CardDescription>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent data-card-body>
              <p data-review-debt>{debtSentence(entry, now)}</p>
              <p data-review-due>{dueSentence(entry, now)}</p>
              <p data-review-categories>{entry.categories.map(categoryLabel).join(' · ')}</p>

              {entry.reviewed_at === null ? (
                <ReviewVerdict
                  entry={entry}
                  busy={busy !== null}
                  saving={busy === entry.request_id}
                  onReview={(verdict) => void review(entry.request_id, verdict)}
                />
              ) : (
                <p data-review-verdict-given>
                  {reviewOutcomeMessage(entry)} {formatInstant(entry.reviewed_at)}.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ReviewVerdict({
  entry,
  busy,
  saving,
  onReview,
}: {
  entry: BreakGlassReview
  busy: boolean
  saving: boolean
  onReview: (verdict: BreakGlassReviewOutcome) => void
}) {
  const [verdict, setVerdict] = useState<BreakGlassReviewOutcome | null>(null)
  const [missing, setMissing] = useState(false)
  const issueId = `review-${entry.request_id}-issue`

  return (
    <div data-review-actions>
      <RadioGroup
        value={verdict ?? ''}
        aria-label={`Veredicto sobre ${entry.case_reference}`}
        aria-describedby={missing ? issueId : undefined}
        onValueChange={(value) => {
          const chosen = REVIEW_OUTCOMES.find((option) => option === value)
          if (!chosen) return
          setVerdict(chosen)
          setMissing(false)
        }}
      >
        {REVIEW_OUTCOMES.map((option) => (
          <Field key={option} orientation="horizontal">
            <RadioGroupItem
              id={`review-${entry.request_id}-${option}`}
              value={option}
              disabled={busy}
              data-review-verdict={option}
            />
            <FieldContent>
              <FieldLabel htmlFor={`review-${entry.request_id}-${option}`}>
                {outcomeLabel(option)}
              </FieldLabel>
              <FieldDescription data-review-meaning={option}>
                {outcomeMeaning(option)}
              </FieldDescription>
            </FieldContent>
          </Field>
        ))}
      </RadioGroup>
      {missing ? <FieldError id={issueId}>Elige un veredicto.</FieldError> : null}
      <div data-form-actions>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            if (verdict) onReview(verdict)
            else setMissing(true)
          }}
        >
          {saving ? 'Guardando…' : 'Registrar la revisión'}
        </Button>
      </div>
    </div>
  )
}

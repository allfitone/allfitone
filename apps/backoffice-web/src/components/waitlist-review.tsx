'use client'

/**
 * `HU-BO-035` — who joined the Allfit Space waitlist, through where, and who should
 * not count.
 *
 * **The totals are of the whole list, the table is a page of it.** They are read
 * apart, so a search narrows the table and never the numbers above it.
 *
 * **A discard made on joining is told apart from a fraud mark.** The first is the
 * list's own rule and carries no decision; the second is a person's, and the row shows
 * its reason and its date.
 *
 * **What a mark does is said before it is done, and so is what taking it back does.**
 * A mark costs the sign-up its number and the person it counts for; taking it back
 * returns the second and not the first, which went to someone else. One dialog serves
 * both commands, spells out which, and asks for the reason that stays in the record.
 *
 * **A lost answer never acts twice.** The command is kept while the reason stays the
 * same, so retrying after a network failure replays it. A reworded reason is a new
 * command.
 *
 * **After either command the list is read again.** A Founding Member number moves to
 * another sign-up, which may be on screen; patching one row would leave the other stale.
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { toast } from '@allfitone/react/components/sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type BackofficeCommand,
} from '@/lib/backoffice-api'
import { formatInstant } from '@/lib/platform-access'
import { isRefusal } from '@/lib/screen-state'
import {
  EMPTY_WAITLIST_FILTERS,
  FRAUD_REASON_REQUIRED,
  MAX_FRAUD_REASON,
  SHARED_CONNECTION_MEANING,
  WAITLIST_FILTERS,
  accountLabel,
  channelLabel,
  channelMeaning,
  discardDetail,
  discardLabel,
  discardMeaning,
  filterLabel,
  foundingLabel,
  fraudConsequences,
  fraudMessage,
  fraudOutcomeMessage,
  parseFraudReason,
  sharedConnectionLabel,
  toWaitlistQuery,
  totalFigures,
  waitlistAnswer,
  waitlistFilterIssue,
  waitlistFilterIssueMessage,
  waitlistMessage,
  withdrawalConsequences,
  withdrawalMessage,
  withdrawalOutcomeMessage,
  WITHDRAWAL_REASON_REQUIRED,
  type WaitlistFilter,
  type WaitlistFilters,
  type WaitlistSignup,
  type WaitlistTotals,
} from '@/lib/waitlist-review'

import { ScreenFailure, ScreenLoading } from './screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

const ANY = 'any'

type ReviewKind = 'mark' | 'withdraw'

interface ReviewAction {
  kind: ReviewKind
  signup: WaitlistSignup
}

interface ReviewCopy {
  title: string
  placeholder: string
  reasonRequired: string
  failureTitle: string
  keep: string
  confirm: string
  busy: string
  done: string
  consequences: (signup: WaitlistSignup) => string[]
  refusal: (code: string) => string
}

// The two commands over a sign-up share one dialog; this is everything that differs.
const REVIEW_COPY: Record<ReviewKind, ReviewCopy> = {
  mark: {
    title: 'Marcar como fraude',
    placeholder: 'Correos en serie desde un mismo equipo',
    reasonRequired: FRAUD_REASON_REQUIRED,
    failureTitle: 'No se marcó',
    keep: 'Dejarla como está',
    confirm: 'Marcar como fraude',
    busy: 'Marcando…',
    done: 'Marcada como fraude',
    consequences: fraudConsequences,
    refusal: fraudMessage,
  },
  withdraw: {
    title: 'Quitar la marca de fraude',
    placeholder: 'La persona escribió y es real',
    reasonRequired: WITHDRAWAL_REASON_REQUIRED,
    failureTitle: 'No se quitó la marca',
    keep: 'Dejarla marcada',
    confirm: 'Quitar la marca',
    busy: 'Quitando…',
    done: 'Marca de fraude retirada',
    consequences: withdrawalConsequences,
    refusal: withdrawalMessage,
  },
}

export function WaitlistReview() {
  const [state, setState] = useState<LoadState>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [signups, setSignups] = useState<WaitlistSignup[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [appending, setAppending] = useState(false)
  const [appendFailure, setAppendFailure] = useState<string | null>(null)
  const [draft, setDraft] = useState<WaitlistFilters>(EMPTY_WAITLIST_FILTERS)
  const [applied, setApplied] = useState<WaitlistFilters>(EMPTY_WAITLIST_FILTERS)
  const [issue, setIssue] = useState<string | null>(null)
  const [totals, setTotals] = useState<WaitlistTotals | null>(null)
  const [totalsFailure, setTotalsFailure] = useState<string | null>(null)
  // Bumped after a command and by a retry: both reads start again from the first page.
  const [revision, setRevision] = useState(0)

  const [action, setAction] = useState<ReviewAction | null>(null)
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)
  const [actionFailure, setActionFailure] = useState<string | null>(null)
  const pending = useRef<BackofficeCommand | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        setTotals(await backofficeApi.waitlistTotals(controller.signal))
        setTotalsFailure(null)
      } catch (error) {
        if (controller.signal.aborted) return
        // The list answers a refusal and an expired session for both reads.
        setTotalsFailure(readFailure(error))
      }
    })()
    return () => controller.abort()
  }, [revision])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const page = await backofficeApi.waitlistSignups(
          toWaitlistQuery(applied),
          controller.signal,
        )
        setSignups(page.data)
        setCursor(page.page.next_cursor)
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(error))
        setFailure(readFailure(error))
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [applied, revision])

  function submit(event: FormEvent) {
    event.preventDefault()
    const broken = waitlistFilterIssue(draft)
    if (broken) {
      setIssue(waitlistFilterIssueMessage(broken))
      return
    }
    setIssue(null)
    setAppendFailure(null)
    setState('loading')
    setApplied({ query: draft.query.trim(), filter: draft.filter })
  }

  function reload() {
    setAppendFailure(null)
    setState('loading')
    setRevision((current) => current + 1)
  }

  async function loadMore() {
    if (!cursor) return
    setAppending(true)
    setAppendFailure(null)
    try {
      const page = await backofficeApi.waitlistSignups(toWaitlistQuery(applied, cursor))
      setSignups((current) => [...current, ...page.data])
      setCursor(page.page.next_cursor)
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setAppendFailure(readFailure(error))
    } finally {
      setAppending(false)
    }
  }

  function openAction(kind: ReviewKind, signup: WaitlistSignup) {
    pending.current = null
    setReason('')
    setActionFailure(null)
    setAction({ kind, signup })
  }

  function closeAction() {
    // Closing mid-flight would hide a command that is still going to land.
    if (sending) return
    setAction(null)
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!action) return
    const copy = REVIEW_COPY[action.kind]
    const parsed = parseFraudReason(reason)
    if (!parsed) {
      setActionFailure(copy.reasonRequired)
      return
    }
    const command = pending.current ?? newBackofficeCommand()
    pending.current = command
    setSending(true)
    setActionFailure(null)
    try {
      // A mark is told from the sign-up as it was; a withdrawal from the answer, because
      // only the answer knows whether a number was free.
      const message =
        action.kind === 'mark'
          ? await backofficeApi
              .markWaitlistSignupAsFraud(action.signup.id, parsed, command)
              .then(() => fraudOutcomeMessage(action.signup))
          : withdrawalOutcomeMessage(
              await backofficeApi.withdrawWaitlistFraudMark(action.signup.id, parsed, command),
            )
      pending.current = null
      // Where the operator looks, instead of above the list the dialog came from.
      toast.success(copy.done, { description: message })
      setAction(null)
      reload()
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setActionFailure(
        error instanceof BackofficeNetworkError
          ? copy.refusal('network-unavailable')
          : copy.refusal(error instanceof BackofficeApiError ? error.code : 'unknown'),
      )
    } finally {
      setSending(false)
    }
  }

  const copy = action ? REVIEW_COPY[action.kind] : null

  if (state === 'failed' && refused) {
    return (
      <div data-waitlist-review>
        <ScreenFailure
          refused
          duties={['manage_platform_commercial']}
          title="No se pudo leer la lista de espera"
          message={failure ?? waitlistMessage('forbidden')}
        />
      </div>
    )
  }

  return (
    <div data-waitlist-review>
      {totals ? <WaitlistTotalsCard totals={totals} /> : null}
      {!totals && totalsFailure && state !== 'failed' ? (
        <ScreenFailure
          refused={false}
          duties={[]}
          title="No se pudieron leer los totales"
          message={totalsFailure}
          onRetry={reload}
          data-waitlist-totals-failure
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Buscar una inscripción
          </CardTitle>
          <CardDescription>
            Por una parte del nombre, del correo o del código de referido. La búsqueda acota la
            tabla; los totales de arriba son siempre de la lista completa.
          </CardDescription>
        </CardHeader>
        <CardContent data-card-body>
          <form onSubmit={submit} data-waitlist-filters noValidate>
            <div data-waitlist-filter-row>
              <Field>
                <FieldLabel htmlFor="waitlist-query">Nombre, correo o código</FieldLabel>
                <Input
                  id="waitlist-query"
                  type="search"
                  value={draft.query}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, query: event.target.value }))
                  }
                  placeholder="ana@ejemplo.com"
                  autoComplete="off"
                  aria-invalid={issue ? true : undefined}
                  aria-describedby={issue ? 'waitlist-query-issue' : undefined}
                  disabled={state === 'loading'}
                />
                {issue ? <FieldError id="waitlist-query-issue">{issue}</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="waitlist-filter">Mostrar</FieldLabel>
                {/* Without the labels the trigger shows the raw value until the popup opens. */}
                <Select
                  items={[
                    { value: ANY, label: filterLabel(ANY) },
                    ...WAITLIST_FILTERS.map((option) => ({
                      value: option,
                      label: filterLabel(option),
                    })),
                  ]}
                  value={draft.filter}
                  onValueChange={(next) =>
                    setDraft((current) => ({
                      ...current,
                      filter: (next ?? ANY) as WaitlistFilter | typeof ANY,
                    }))
                  }
                >
                  <SelectTrigger id="waitlist-filter">
                    <SelectValue>{filterLabel(draft.filter)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>{filterLabel(ANY)}</SelectItem>
                    {WAITLIST_FILTERS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {filterLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div data-form-actions>
                <Button type="submit" disabled={state === 'loading'}>
                  Buscar
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {state === 'loading' ? <ScreenLoading /> : null}

      {state === 'failed' ? (
        <ScreenFailure
          refused={false}
          duties={[]}
          title="No se pudo leer la lista de espera"
          message={failure ?? waitlistMessage('upstream-unavailable')}
          onRetry={reload}
        />
      ) : null}

      {state === 'ready' ? (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Inscripciones
            </CardTitle>
            <CardDescription>
              «No cuenta» es una inscripción que la lista descartó sola al entrar, por venir de un
              dispositivo repetido: no suma como referido, y no es una acusación. «Fraude» es una
              decisión del equipo y lleva su motivo.
            </CardDescription>
          </CardHeader>
          <CardContent data-waitlist-body>
            <Alert live="polite" variant="info" data-waitlist-answer>
              <AlertTitle>Resultado</AlertTitle>
              <AlertDescription>
                {waitlistAnswer(signups.length, cursor !== null, applied)}
              </AlertDescription>
            </Alert>

            {signups.length > 0 ? (
              <Table
                scrollAreaLabel="Inscripciones en la lista de espera"
                containerClassName="waitlist-signups"
                data-waitlist-signups
              >
                <TableHeader>
                  <TableRow>
                    <TableHead data-waitlist-head>Persona</TableHead>
                    <TableHead data-waitlist-head>Se inscribió</TableHead>
                    <TableHead data-waitlist-head>Canal</TableHead>
                    <TableHead data-waitlist-head>Con cuenta</TableHead>
                    <TableHead align="end" data-waitlist-head>
                      Referidos válidos
                    </TableHead>
                    <TableHead data-waitlist-head>Revisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signups.map((signup) => (
                    <SignupRow
                      key={signup.id}
                      signup={signup}
                      onMark={() => openAction('mark', signup)}
                      onWithdraw={() => openAction('withdraw', signup)}
                      disabled={sending}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : null}

            {appendFailure ? (
              <Alert live="assertive" variant="danger" data-waitlist-append-failure>
                <AlertTitle>No se pudieron cargar más inscripciones</AlertTitle>
                <AlertDescription>{appendFailure}</AlertDescription>
              </Alert>
            ) : null}

            {cursor ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={appending}
                onClick={() => void loadMore()}
              >
                {appending ? 'Cargando…' : 'Ver más inscripciones'}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={action !== null}
        onOpenChange={(next) => {
          if (!next) closeAction()
        }}
      >
        {action && copy ? (
          <DialogContent
            data-waitlist-fraud-dialog
            data-review-kind={action.kind}
            showCloseButton={false}
          >
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>
                {action.signup.name} · {action.signup.email}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void send(event)} data-waitlist-fraud-form noValidate>
              <ul data-waitlist-fraud-consequences aria-label="Qué cambia">
                {copy.consequences(action.signup).map((consequence) => (
                  <li key={consequence}>{consequence}</li>
                ))}
              </ul>
              <Field>
                <FieldLabel htmlFor="waitlist-fraud-reason">Motivo</FieldLabel>
                <Input
                  id="waitlist-fraud-reason"
                  name="reason"
                  autoComplete="off"
                  maxLength={MAX_FRAUD_REASON}
                  placeholder={copy.placeholder}
                  value={reason}
                  disabled={sending}
                  aria-describedby="waitlist-fraud-reason-help"
                  aria-invalid={actionFailure === copy.reasonRequired}
                  onChange={(event) => {
                    // A reworded reason is another request: it must not reuse the key.
                    pending.current = null
                    setReason(event.target.value)
                  }}
                />
                <FieldDescription id="waitlist-fraud-reason-help">
                  Una línea que otra persona del equipo entienda al leer el registro.
                </FieldDescription>
              </Field>
              {actionFailure ? (
                <Alert live="assertive" variant="danger" data-waitlist-fraud-failure>
                  <AlertTitle>{copy.failureTitle}</AlertTitle>
                  <AlertDescription>{actionFailure}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={sending} onClick={closeAction}>
                  {copy.keep}
                </Button>
                {/* Only the mark takes something away, so only it reads as destructive. */}
                <Button
                  type="submit"
                  disabled={sending}
                  {...(action.kind === 'mark' ? { variant: 'destructive' as const } : {})}
                >
                  {sending ? copy.busy : copy.confirm}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}

function WaitlistTotalsCard({ totals }: { totals: WaitlistTotals }) {
  return (
    <Card data-waitlist-totals>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Lista de espera de Allfit Space
        </CardTitle>
        <CardDescription>
          Totales de la lista completa. El canal es el que nombraba el link con el que llegó cada
          persona; sin canal en el link, es «Referido» si llegó invitada y «Directo» si no.
        </CardDescription>
      </CardHeader>
      <CardContent data-waitlist-body>
        <dl data-waitlist-figures>
          {totalFigures(totals).map((figure) => (
            <div key={figure.key} data-waitlist-figure={figure.key}>
              <dt>{figure.label}</dt>
              <dd data-waitlist-value>{figure.value}</dd>
              <dd data-waitlist-note>{figure.note}</dd>
            </div>
          ))}
        </dl>

        {totals.channels.length > 0 ? (
          <Table
            scrollAreaLabel="Inscripciones por canal"
            containerClassName="waitlist-channels"
            data-waitlist-channels
          >
            <TableHeader>
              <TableRow>
                <TableHead data-waitlist-channel-cell>Canal</TableHead>
                <TableHead align="end" data-waitlist-channel-cell>
                  Inscritos
                </TableHead>
                <TableHead align="end" data-waitlist-channel-cell>
                  Confirmaron
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.channels.map((row) => (
                <TableRow
                  key={`${row.channel.kind}:${row.channel.source ?? ''}`}
                  data-waitlist-channel={row.channel.kind}
                >
                  <TableCell title={channelMeaning(row.channel)} data-waitlist-channel-cell>
                    {channelLabel(row.channel)}
                  </TableCell>
                  <TableCell align="end" numeric data-waitlist-channel-cell>
                    {row.signups}
                  </TableCell>
                  <TableCell align="end" numeric data-waitlist-channel-cell>
                    {row.confirmed}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SignupRow({
  signup,
  onMark,
  onWithdraw,
  disabled,
}: {
  signup: WaitlistSignup
  onMark: () => void
  onWithdraw: () => void
  disabled: boolean
}) {
  const shared = sharedConnectionLabel(signup.referrals_sharing_connection)
  const at = signup.email.lastIndexOf('@')
  const founding = foundingLabel(signup.founding_number)
  const detail = signup.discard_reason ? discardDetail(signup.discard_reason) : undefined
  return (
    <TableRow data-waitlist-row data-discard={signup.discard_reason ?? 'none'}>
      <TableCell data-label="Persona" data-waitlist-cell="person">
        <div data-waitlist-person>
          <strong>{signup.name}</strong>
          {/* A long address breaks after the @, not in the middle of a word. */}
          <span data-waitlist-email>
            {signup.email.slice(0, at + 1)}
            <wbr />
            {signup.email.slice(at + 1)}
          </span>
          <code title="Código de referido">{signup.referral_code}</code>
          {founding ? (
            <Badge variant="info" data-waitlist-founding>
              {founding}
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell data-label="Se inscribió">
        <div data-waitlist-stack>
          <span data-waitlist-instant>{formatInstant(signup.joined_at)}</span>
          {signup.confirmed_at ? (
            <span data-waitlist-confirmed>
              Confirmó su correo:{' '}
              <span data-waitlist-instant>{formatInstant(signup.confirmed_at)}</span>
            </span>
          ) : (
            <Badge variant="secondary">Sin confirmar</Badge>
          )}
        </div>
      </TableCell>
      <TableCell data-label="Canal">
        <div data-waitlist-stack>
          <span title={channelMeaning(signup.channel)}>{channelLabel(signup.channel)}</span>
          {signup.invited_by ? (
            <span data-waitlist-inviter>
              <span>Invitó: {signup.invited_by.name}</span>
              <code title="Código de quien invitó">{signup.invited_by.referral_code}</code>
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell data-label="Con cuenta">
        <span data-waitlist-account>{accountLabel(signup)}</span>
      </TableCell>
      <TableCell data-label="Referidos válidos" align="end" numeric>
        <div data-waitlist-stack data-align="end">
          <span data-waitlist-referrals>{signup.referrals}</span>
          {shared ? (
            <Badge variant="warning" title={SHARED_CONNECTION_MEANING} data-waitlist-shared>
              {shared}
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell data-label="Revisión">
        <div data-waitlist-stack>
          {signup.discard_reason ? (
            <Badge
              variant={signup.discard_reason === 'fraud' ? 'destructive' : 'secondary'}
              title={discardMeaning(signup.discard_reason)}
            >
              {discardLabel(signup.discard_reason)}
            </Badge>
          ) : null}
          {detail ? <span data-waitlist-discard-detail>{detail}</span> : null}
          {signup.fraud ? (
            <>
              <span data-waitlist-fraud-reason>
                <span>{signup.fraud.reason}</span>
                <span data-waitlist-instant>{formatInstant(signup.fraud.marked_at)}</span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                data-waitlist-action
                aria-label={`Quitar la marca de fraude de la inscripción de ${signup.name}`}
                onClick={onWithdraw}
              >
                Quitar la marca
              </Button>
            </>
          ) : (
            <>
              {signup.fraud_withdrawal ? (
                <span data-waitlist-fraud-withdrawal>
                  <span>Marca de fraude retirada: {signup.fraud_withdrawal.reason}</span>
                  <span data-waitlist-instant>
                    {formatInstant(signup.fraud_withdrawal.withdrawn_at)}
                  </span>
                </span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                data-waitlist-action
                aria-label={`Marcar como fraude la inscripción de ${signup.name}`}
                onClick={onMark}
              >
                Marcar como fraude
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function readFailure(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return waitlistMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return waitlistMessage(error.code)
  return waitlistMessage('upstream-unavailable')
}

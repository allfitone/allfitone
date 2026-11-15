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
 * **What a mark does is said before it is done.** It is not undone here, so the
 * dialog spells out what this sign-up loses — the number it holds, the person it
 * counts for — and asks for the reason that stays in the record.
 *
 * **A lost answer never marks twice.** The command is kept while the reason stays the
 * same, so retrying after a network failure replays it. A reworded reason is a new
 * command.
 *
 * **After a mark the list is read again.** A freed Founding Member number goes to
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
  type WaitlistFilter,
  type WaitlistFilters,
  type WaitlistSignup,
  type WaitlistTotals,
} from '@/lib/waitlist-review'

import { ScreenFailure, ScreenLoading } from './screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

const ANY = 'any'

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
  // Bumped after a mark and by a retry: both reads start again from the first page.
  const [revision, setRevision] = useState(0)

  const [target, setTarget] = useState<WaitlistSignup | null>(null)
  const [reason, setReason] = useState('')
  const [marking, setMarking] = useState(false)
  const [markFailure, setMarkFailure] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
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
    setOutcome(null)
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

  function openMark(signup: WaitlistSignup) {
    pending.current = null
    setReason('')
    setMarkFailure(null)
    setTarget(signup)
  }

  function closeMark() {
    // Closing mid-flight would hide a command that is still going to land.
    if (marking) return
    setTarget(null)
  }

  async function mark(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    const parsed = parseFraudReason(reason)
    if (!parsed) {
      setMarkFailure(FRAUD_REASON_REQUIRED)
      return
    }
    const command = pending.current ?? newBackofficeCommand()
    pending.current = command
    setMarking(true)
    setMarkFailure(null)
    try {
      await backofficeApi.markWaitlistSignupAsFraud(target.id, parsed, command)
      pending.current = null
      setOutcome(fraudOutcomeMessage(target))
      setTarget(null)
      reload()
    } catch (error) {
      if (error instanceof BackofficeApiError && error.status === 401) {
        window.location.assign('/')
        return
      }
      setMarkFailure(
        error instanceof BackofficeNetworkError
          ? fraudMessage('network-unavailable')
          : fraudMessage(error instanceof BackofficeApiError ? error.code : 'unknown'),
      )
    } finally {
      setMarking(false)
    }
  }

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
        <CardContent>
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
                  disabled={state === 'loading'}
                />
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
            {issue ? <FieldError>{issue}</FieldError> : null}
          </form>
        </CardContent>
      </Card>

      {outcome ? (
        <Alert live="polite" variant="success" data-waitlist-outcome>
          <AlertTitle>Marcada como fraude</AlertTitle>
          <AlertDescription>{outcome}</AlertDescription>
        </Alert>
      ) : null}

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
              <Table scrollAreaLabel="Inscripciones en la lista de espera" data-waitlist-signups>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Se inscribió</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead align="end">Referidos válidos</TableHead>
                    <TableHead>Revisión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signups.map((signup) => (
                    <SignupRow
                      key={signup.id}
                      signup={signup}
                      onMark={() => openMark(signup)}
                      disabled={marking}
                    />
                  ))}
                </TableBody>
              </Table>
            ) : null}

            {appendFailure ? (
              <Alert live="assertive" variant="danger">
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
        open={target !== null}
        onOpenChange={(next) => {
          if (!next) closeMark()
        }}
      >
        {target ? (
          <DialogContent data-waitlist-fraud-dialog showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Marcar como fraude</DialogTitle>
              <DialogDescription>
                {target.name} · {target.email}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void mark(event)} data-waitlist-fraud-form noValidate>
              <ul data-waitlist-fraud-consequences aria-label="Qué cambia">
                {fraudConsequences(target).map((consequence) => (
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
                  placeholder="Correos en serie desde un mismo equipo"
                  value={reason}
                  disabled={marking}
                  aria-describedby="waitlist-fraud-reason-help"
                  aria-invalid={markFailure === FRAUD_REASON_REQUIRED}
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
              {markFailure ? (
                <Alert live="assertive" variant="danger" data-waitlist-fraud-failure>
                  <AlertTitle>No se marcó</AlertTitle>
                  <AlertDescription>{markFailure}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={marking} onClick={closeMark}>
                  Dejarla como está
                </Button>
                <Button type="submit" variant="destructive" disabled={marking}>
                  {marking ? 'Marcando…' : 'Marcar como fraude'}
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
                <TableHead>Canal</TableHead>
                <TableHead align="end">Inscritos</TableHead>
                <TableHead align="end">Confirmaron</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.channels.map((row) => (
                <TableRow
                  key={`${row.channel.kind}:${row.channel.source ?? ''}`}
                  data-waitlist-channel={row.channel.kind}
                >
                  <TableCell title={channelMeaning(row.channel)}>
                    {channelLabel(row.channel)}
                  </TableCell>
                  <TableCell align="end" numeric>
                    {row.signups}
                  </TableCell>
                  <TableCell align="end" numeric>
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
  disabled,
}: {
  signup: WaitlistSignup
  onMark: () => void
  disabled: boolean
}) {
  const shared = sharedConnectionLabel(signup.referrals_sharing_connection)
  const founding = foundingLabel(signup.founding_number)
  const detail = signup.discard_reason ? discardDetail(signup.discard_reason) : undefined
  return (
    <TableRow data-waitlist-row data-discard={signup.discard_reason ?? 'none'}>
      <TableCell data-label="Persona" data-waitlist-cell="person">
        <div data-waitlist-person>
          <strong>{signup.name}</strong>
          <span>{signup.email}</span>
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
            <span data-waitlist-fraud-reason>
              <span>{signup.fraud.reason}</span>
              <span data-waitlist-instant>{formatInstant(signup.fraud.marked_at)}</span>
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              aria-label={`Marcar como fraude la inscripción de ${signup.name}`}
              onClick={onMark}
            >
              Marcar como fraude
            </Button>
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

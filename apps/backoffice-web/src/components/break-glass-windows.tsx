'use client'

/**
 * `HU-BO-008` — the exceptional path.
 *
 * Four decisions shape this screen, and none of them is layout.
 *
 * **The tier is a consequence, not a field.** The operator picks categories and
 * the screen says what follows. Asking opens the window for sixty minutes at any
 * tier (ADR-046), and somebody else reviews it afterwards. There is no control for
 * the tier or the duration, and no approval step to wait for.
 *
 * **Forbidden categories are absent.** Not disabled, not annotated — they do not
 * appear. An option that can never be granted is an invitation to try.
 *
 * **A window says how long it has left.** An hour passes quickly while reading,
 * and "open" alone does not tell anyone to hurry. There is no extend button
 * because there is no extension.
 *
 * **A denied attempt is shown as a recorded fact, not an error.** The evidence is
 * the point: the operator sees which reason was written, and the person whose data
 * it was sees the same attempt in their own audit trail.
 *
 * What an allowed read returned lives only as long as its window: when the window
 * closes or lapses, the content leaves the screen with it.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@allfitone/react/components/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { ScreenEmpty, ScreenFailure, ScreenLoading } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Checkbox } from '@allfitone/react/components/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { useSearchParams } from 'next/navigation'
import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type BreakGlassRequest,
} from '@/lib/backoffice-api'
import { formatInstant } from '@/lib/platform-access'
import {
  BREAK_GLASS_CATEGORIES,
  BREAK_GLASS_PURPOSES,
  breakGlassMessage,
  canExercise,
  categoryLabel,
  emptyReadMessage,
  decisionReasonLabel,
  healthContextRows,
  mealRows,
  requestPrefill,
  measurementRows,
  photoDayRows,
  trainingRows,
  agendaRows,
  outcomeMessage,
  purposeLabel,
  requestIssue,
  requestIssueMessage,
  resourceTypeFor,
  statusLabel,
  statusTone,
  tierConsequence,
  tierLabel,
  windowSentence,
  type BreakGlassCategory,
  type BreakGlassExerciseOutcome,
  type BreakGlassPurpose,
} from '@/lib/break-glass'
import { isRefusal } from '@/lib/screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

export function BreakGlassWindows() {
  const [state, setState] = useState<LoadState>('loading')
  const [files, setFiles] = useState<BreakGlassRequest[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // From the person's card the subject and the case arrive in the link.
  const prefill = requestPrefill(useSearchParams())
  const [subject, setSubject] = useState(prefill.subject)
  const [caseReference, setCaseReference] = useState(prefill.caseReference)
  const [purpose, setPurpose] = useState<BreakGlassPurpose>('customer_support_request')
  const [categories, setCategories] = useState<BreakGlassCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{
    fileId: string
    answer: BreakGlassExerciseOutcome
  } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [closing, setClosing] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const read = await backofficeApi.breakGlassRequests({}, signal)
      setFiles(read.items)
      setState('ready')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      if (caught instanceof BackofficeApiError && caught.status === 401) {
        window.location.assign('/')
        return
      }
      setRefused(isRefusal(caught))
      setFailure(failureMessage(caught))
      setState('failed')
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  // A window is minutes long, so the countdown has to move without an interaction:
  // an operator watching the screen has to see it lapse rather than find out by
  // clicking. When it reaches zero the read is no longer offered — that is what
  // closing itself means here, since there is no extension to offer instead.
  const hasOpenWindow = files.some(
    (file) => file.status === 'approved' && file.window_ends_at !== null,
  )
  useEffect(() => {
    if (!hasOpenWindow) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [hasOpenWindow])

  const consequence = tierConsequence(categories)
  const readFile = outcome ? files.find((file) => file.id === outcome.fileId) : undefined
  const readStillOpen = readFile ? canExercise(readFile, now) : false
  const shown = outcome && readStillOpen ? outcome.answer : null
  const rows = shown ? measurementRows(shown) : []
  const photoDays = shown ? photoDayRows(shown) : []
  const claims = shown ? healthContextRows(shown) : []
  const eaten = shown ? mealRows(shown) : []
  const trained = shown ? trainingRows(shown) : []
  const agenda = shown ? agendaRows(shown) : []

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true)
    setNotice(null)
    try {
      await operation()
      await load()
      setNotice({ tone: 'success', message: success })
    } catch (caught) {
      setNotice({ tone: 'danger', message: failureMessage(caught) })
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const broken = requestIssue({ subject, caseReference, categories })
    if (broken) {
      setError(requestIssueMessage(broken))
      return
    }
    setError(null)
    await run(
      () =>
        backofficeApi.requestBreakGlass(
          {
            subject_person_id: subject.trim(),
            categories,
            purpose,
            case_reference: caseReference.trim(),
          },
          newBackofficeCommand(),
        ),
      'Ventana abierta por 60 minutos. Cada lectura queda registrada y otra persona la revisa después.',
    )
    setCategories([])
  }

  async function exercise(file: BreakGlassRequest, category: BreakGlassCategory) {
    setBusy(true)
    setNotice(null)
    setOutcome(null)
    try {
      // Every attempt is recorded before this answers, so the outcome is shown as
      // a fact rather than as a failure.
      const answer = await backofficeApi.exerciseBreakGlass(file.id, {
        category,
        resource_type: resourceTypeFor(category),
      })
      setOutcome({ fileId: file.id, answer })
      await load()
    } catch (caught) {
      setNotice({ tone: 'danger', message: failureMessage(caught) })
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <ScreenLoading />

  if (state === 'failed') {
    return (
      <ScreenFailure
        refused={refused}
        duties={['request_break_glass']}
        title="No se pudo leer la bandeja"
        message={failure ?? breakGlassMessage('upstream-unavailable')}
        onRetry={() => void load()}
      />
    )
  }

  return (
    <div data-break-glass>
      {notice ? (
        <Alert live="polite" variant={notice.tone === 'success' ? 'success' : 'danger'}>
          <AlertTitle>{notice.tone === 'success' ? 'Hecho' : 'No se aplicó'}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {outcome ? (
        <Alert live="assertive" variant={outcomeTone(outcome.answer)} data-break-glass-outcome>
          <AlertTitle>{outcomeTitle(outcome.answer)}</AlertTitle>
          <AlertDescription>
            {outcomeMessage(outcome.answer)} La persona verá este intento en su propio registro de
            accesos, con la hora exacta.
            {outcome.answer.outcome === 'allowed' && !readStillOpen
              ? ' La ventana cerró y lo que devolvió dejó de mostrarse.'
              : null}
            {shown?.outcome === 'allowed' &&
            rows.length === 0 &&
            claims.length === 0 &&
            eaten.length === 0 &&
            trained.length === 0 &&
            agenda.length === 0
              ? ` ${emptyReadMessage(shown.category)}`
              : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {rows.length > 0 ? (
        <Table scrollAreaLabel="Mediciones de la persona" data-break-glass-content>
          <TableCaption>Mediciones de la persona</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Medida</TableHead>
              <TableHead>Como la registró</TableHead>
              <TableHead>Normalizada</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Foto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.metric}</TableCell>
                <TableCell numeric>{row.recorded}</TableCell>
                <TableCell numeric>{row.normalized}</TableCell>
                <TableCell>{row.measuredOn}</TableCell>
                <TableCell>{row.photo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {/* HU-BO-009 criterion 3: a photo's existence is shown, never the photo. */}
      {photoDays.length > 0 ? (
        <Table scrollAreaLabel="Días con fotos de progreso" data-break-glass-content>
          <TableCaption>
            Días con fotos de progreso. Se sabe que existen; no se abren desde el Backoffice.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Fotos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {photoDays.map((photoDay) => (
              <TableRow key={photoDay.day}>
                <TableCell>{photoDay.day}</TableCell>
                <TableCell numeric>{photoDay.photos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {claims.length > 0 ? (
        <Table scrollAreaLabel="Contexto de salud de la persona" data-break-glass-content>
          <TableCaption>Contexto de salud de la persona</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Lo que declaró</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Hasta</TableHead>
              <TableHead>Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell>{claim.type}</TableCell>
                <TableCell data-break-glass-declared>{claim.description}</TableCell>
                <TableCell>{claim.area}</TableCell>
                <TableCell>{claim.since}</TableCell>
                <TableCell>{claim.until}</TableCell>
                <TableCell data-break-glass-origin>{claim.provenance}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {eaten.length > 0 ? (
        <Table scrollAreaLabel="Comidas de la persona" data-break-glass-content>
          <TableCaption>Comidas de la persona</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Lo que comió</TableHead>
              <TableHead>Valores</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead>Foto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eaten.map((meal) => (
              <TableRow key={meal.id}>
                <TableCell data-break-glass-moment>{meal.when}</TableCell>
                <TableCell>{meal.type}</TableCell>
                <TableCell data-break-glass-meal>{meal.eaten}</TableCell>
                <TableCell data-break-glass-meal>{meal.totals}</TableCell>
                <TableCell data-break-glass-meal>{meal.note}</TableCell>
                <TableCell data-break-glass-origin>{meal.photo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {trained.length > 0 ? (
        <Table scrollAreaLabel="Sesiones de entrenamiento de la persona" data-break-glass-content>
          <TableCaption>Sesiones de entrenamiento de la persona</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Actividad</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Lo que hizo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Nivel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trained.map((session) => (
              <TableRow key={session.id}>
                <TableCell data-break-glass-moment>{session.when}</TableCell>
                <TableCell>{session.activity}</TableCell>
                <TableCell>{session.duration}</TableCell>
                <TableCell data-break-glass-done>
                  {session.done}
                  {/* HU-BO-008 c2: the session opens to each thing it recorded. */}
                  {session.detail.length > 0 ? (
                    <details data-break-glass-session-detail>
                      <summary>Ver lo registrado</summary>
                      <ul>
                        {session.detail.map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </TableCell>
                <TableCell data-break-glass-origin>{session.state}</TableCell>
                <TableCell data-break-glass-level>{session.level}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {/* HU-BO-008 c3: what is planned and from which programme, by its name only. */}
      {agenda.length > 0 ? (
        <Table scrollAreaLabel="Agenda de la persona" data-break-glass-content>
          <TableCaption>
            Agenda de la persona. Cada programa aparece por su nombre; su contenido no se abre desde
            aquí.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Cuándo</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Origen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agenda.map((entry, index) => (
              <TableRow key={`${index}-${entry.when}`}>
                <TableCell>{entry.when}</TableCell>
                <TableCell>{entry.program}</TableCell>
                <TableCell>{entry.day}</TableCell>
                <TableCell>{entry.status}</TableCell>
                <TableCell>{entry.origin}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Pedir una ventana excepcional
          </CardTitle>
          <CardDescription>
            Sólo cuando el estado operativo no alcanza. Se abre al pedirla y dura 60 minutos. Cada
            lectura queda registrada para la persona afectada, y otra persona revisa la ventana
            después. No existe acceso a «toda la cuenta» ni extensión de una ventana.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} data-backoffice-form data-break-glass-form noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="bg-subject">Persona afectada</FieldLabel>
                <Input
                  id="bg-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="019a8000-0000-7000-8000-000000000006"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bg-case">Referencia del caso</FieldLabel>
                <Input
                  id="bg-case"
                  value={caseReference}
                  onChange={(event) => setCaseReference(event.target.value)}
                  placeholder="CASE-2026-001"
                  autoComplete="off"
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bg-purpose">Propósito</FieldLabel>
                <Select
                  value={purpose}
                  onValueChange={(next) =>
                    setPurpose((next ?? 'customer_support_request') as BreakGlassPurpose)
                  }
                >
                  <SelectTrigger id="bg-purpose" disabled={busy}>
                    <SelectValue>{purposeLabel(purpose)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {BREAK_GLASS_PURPOSES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {purposeLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="bg-categories">Qué necesitas ver</FieldLabel>
                <div id="bg-categories" data-break-glass-categories>
                  {BREAK_GLASS_CATEGORIES.map((category) => (
                    <Field key={category} orientation="horizontal">
                      <Checkbox
                        id={`bg-category-${category}`}
                        checked={categories.includes(category)}
                        onCheckedChange={(checked) =>
                          setCategories((current) =>
                            checked === true
                              ? [...current, category]
                              : current.filter((kept) => kept !== category),
                          )
                        }
                        disabled={busy}
                      />
                      <FieldLabel htmlFor={`bg-category-${category}`}>
                        {categoryLabel(category)}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </Field>

              {consequence ? (
                <Alert live="polite" variant="info" data-break-glass-consequence>
                  <AlertTitle>Alcance {tierLabel(consequence.tier).toLowerCase()}</AlertTitle>
                  <AlertDescription>
                    {consequence.sentence} Eso lo decide el servidor a partir de lo que elegiste; no
                    se puede pedir otro.
                  </AlertDescription>
                </Alert>
              ) : null}

              {error ? <FieldError>{error}</FieldError> : null}

              <div data-form-actions>
                <Button type="submit" disabled={busy}>
                  Pedir la ventana
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {files.length === 0 ? (
        <ScreenEmpty icon="warning" title="No hay expedientes">
          Aquí aparecerán las ventanas, con el tiempo que les queda y cuántas veces se ejercieron.
        </ScreenEmpty>
      ) : (
        files.map((file) => (
          <Card key={file.id} data-break-glass-file>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                {file.case_reference} · {purposeLabel(file.purpose)}
              </CardTitle>
              <CardDescription>
                {file.categories.map((category) => categoryLabel(category)).join(' · ')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl data-facts>
                <dt>Estado</dt>
                <dd>
                  <Badge id={`bg-status-${file.id}`} variant={statusTone(file.status)}>
                    {statusLabel(file.status)}
                  </Badge>
                </dd>
                <dt>Alcance</dt>
                <dd>
                  <span id={`bg-tier-${file.id}`}>
                    {tierLabel(file.sensitivity_tier)} · {file.requested_duration_minutes} minutos
                  </span>
                </dd>
                <dt>Persona afectada</dt>
                <dd>
                  <code id={`bg-subject-${file.id}`}>{file.subject_person_id}</code>
                </dd>
                <dt>Veces ejercida</dt>
                <dd>
                  <span id={`bg-exercises-${file.id}`}>{file.exercise_count}</span>
                </dd>
              </dl>

              {windowSentence(file, now) ? (
                <Alert
                  live="off"
                  variant={canExercise(file, now) ? 'success' : 'warning'}
                  data-break-glass-window
                >
                  <AlertTitle>{windowSentence(file, now)}</AlertTitle>
                  <AlertDescription>
                    Cierra el {formatInstant(file.window_ends_at)}. Para continuar después hay que
                    pedir otra ventana.
                  </AlertDescription>
                </Alert>
              ) : null}

              {file.approvals.length > 0 ? (
                <dl data-facts>
                  {file.approvals.map((approval) => (
                    <Fragment key={approval.approver_person_id}>
                      <dt>{approval.decision === 'approved' ? 'Aprobó' : 'Rechazó'}</dt>
                      <dd>
                        <span id={`bg-approval-${approval.approver_person_id}`}>
                          <code>{approval.approver_person_id}</code> ·{' '}
                          {formatInstant(approval.decided_at)} ·{' '}
                          <span data-break-glass-decision-reason>
                            {decisionReasonLabel(approval.reason_code)}
                          </span>
                        </span>
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              ) : null}

              {canExercise(file, now) ? (
                <div data-form-actions>
                  {file.categories.map((category) => (
                    <Button
                      key={category}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void exercise(file, category)}
                    >
                      Leer {categoryLabel(category).toLowerCase()}
                    </Button>
                  ))}
                  <AlertDialog
                    open={closing === file.id}
                    onOpenChange={(next) => {
                      if (busy) return
                      setClosing(next ? file.id : null)
                    }}
                  >
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setClosing(file.id)}
                    >
                      Cerrar la ventana
                    </Button>
                    <AlertDialogContent data-close-break-glass-dialog>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Cerrar la ventana?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Lo que ya se leyó deja de mostrarse y ninguna lectura vuelve a entregar
                          contenido. No se puede reabrir ni extender: para continuar habría que
                          pedir otra ventana.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Dejarla abierta</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => backofficeApi.closeBreakGlass(file.id, newBackofficeCommand()),
                              'Ventana cerrada. Ninguna lectura entrega contenido desde ahora.',
                            ).then(() => setClosing(null))
                          }
                        >
                          {busy ? 'Cerrando…' : 'Cerrar ahora'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

function outcomeTitle(answer: BreakGlassExerciseOutcome): string {
  if (answer.outcome === 'denied') return 'Intento denegado y registrado'
  if (answer.outcome === 'allowed') return 'Lectura autorizada y registrada'
  return 'Intento registrado'
}

function outcomeTone(answer: BreakGlassExerciseOutcome): 'warning' | 'success' | 'info' {
  if (answer.outcome === 'denied') return 'warning'
  return answer.outcome === 'allowed' ? 'success' : 'info'
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return breakGlassMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return breakGlassMessage(error.code)
  return breakGlassMessage('upstream-unavailable')
}

'use client'

/**
 * `HU-BO-031` — diagnosing a failed operation without opening anyone's data.
 *
 * The screen opens with the delivery circuits rather than the feed. Most "the
 * notification never arrived" cases are one tripped channel, and reading forty
 * individual failures to discover that is the wrong order of work.
 *
 * Only `dead_lettered`, `stalled` and `rejected_final` read as failures.
 * `retrying` is warned about because the platform is still working on it, and
 * `pending` is not a problem at all — flattening them would turn a healthy queue
 * into a wall of red and train the operator to ignore it.
 */

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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  type SupportDeliveryCircuit,
  type SupportOperation,
} from '@/lib/backoffice-api'
import { formatInstant } from '@/lib/platform-access'
import {
  SUPPORT_OPERATION_SOURCES,
  SUPPORT_OPERATION_STATES,
  circuitSummary,
  circuitTone,
  operationStateFilterLabel,
  operationStateLabel,
  operationStateTone,
  sourceFilterLabel,
  sourceLabel,
  supportDiagnosisMessage,
  isValidOperationIdentifier,
  jobHealthLine,
  jobHealthTone,
  jobLabel,
  shortIdentifier,
  silentJobs,
  type SupportJobHealthItem,
  subjectLine,
  type SupportOperationSourceKind,
  type SupportOperationState,
} from '@/lib/support-diagnosis'
import { isRefusal } from '@/lib/screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

const ANY = 'any'

export function SupportDiagnosis() {
  const [state, setState] = useState<LoadState>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [circuits, setCircuits] = useState<SupportDeliveryCircuit[]>([])
  const [operations, setOperations] = useState<SupportOperation[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [appending, setAppending] = useState(false)
  const [source, setSource] = useState<SupportOperationSourceKind | typeof ANY>(ANY)
  const [operationState, setOperationState] = useState<SupportOperationState | typeof ANY>(ANY)
  // HU-BO-031 c3: one operation found by the identifier of what it is about.
  // Read apart from the feed, so a job health read that fails leaves the rest standing.
  const [jobs, setJobs] = useState<SupportJobHealthItem[] | null>(null)
  const [jobsFailed, setJobsFailed] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [identifierDraft, setIdentifierDraft] = useState('')
  const [identifierIssue, setIdentifierIssue] = useState(false)

  const filters = useCallback(
    () => ({
      ...(source === ANY ? {} : { source }),
      ...(operationState === ANY ? {} : { state: operationState }),
      ...(identifier === '' ? {} : { aggregateId: identifier }),
    }),
    [source, operationState, identifier],
  )

  function searchIdentifier(event: FormEvent) {
    event.preventDefault()
    const value = identifierDraft.trim()
    if (!isValidOperationIdentifier(value)) {
      setIdentifierIssue(true)
      return
    }
    setIdentifierIssue(false)
    setIdentifier(value.toLowerCase())
  }

  function clearIdentifier() {
    setIdentifier('')
    setIdentifierDraft('')
    setIdentifierIssue(false)
  }

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const [health, feed] = await Promise.all([
          backofficeApi.supportDeliveryCircuits(controller.signal),
          backofficeApi.supportOperations(filters(), controller.signal),
        ])
        setCircuits(health.items)
        setOperations(feed.data)
        setCursor(feed.page.next_cursor)
        setState('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        if (error instanceof BackofficeApiError && error.status === 401) {
          window.location.assign('/')
          return
        }
        setRefused(isRefusal(error))
        setFailure(failureMessage(error))
        setState('failed')
      }
    })()
    return () => controller.abort()
  }, [filters])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        setJobs((await backofficeApi.supportJobHealth(controller.signal)).items)
        setJobsFailed(false)
      } catch {
        if (!controller.signal.aborted) setJobsFailed(true)
      }
    })()
    return () => controller.abort()
  }, [])

  async function loadMore() {
    if (!cursor) return
    setAppending(true)
    try {
      const feed = await backofficeApi.supportOperations({ ...filters(), cursor })
      setOperations((current) => [...current, ...feed.data])
      setCursor(feed.page.next_cursor)
    } catch (error) {
      setFailure(failureMessage(error))
    } finally {
      setAppending(false)
    }
  }

  if (state === 'loading') return <ScreenLoading />

  if (state === 'failed') {
    return (
      <ScreenFailure
        refused={refused}
        duties={['diagnose_support_metadata']}
        title="No se pudo leer el estado técnico"
        message={failure ?? supportDiagnosisMessage('upstream-unavailable')}
      />
    )
  }

  const summary = circuitSummary(circuits)
  const silent = jobs ? silentJobs(jobs) : []

  return (
    <div data-support-diagnosis>
      {summary ? (
        <Alert live="polite" variant="warning">
          <AlertTitle>Un canal de entrega está caído</AlertTitle>
          <AlertDescription>{summary}</AlertDescription>
        </Alert>
      ) : null}

      {silent.length > 0 ? (
        <Alert live="polite" variant="warning" data-diagnosis-silent-jobs>
          <AlertTitle>Una tarea programada dejó de correr</AlertTitle>
          <AlertDescription>
            {silent.map(jobLabel).join(', ')} no corre hace rato. El worker puede haberse detenido:
            nada más en el Backoffice lo diría.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card data-diagnosis-jobs>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Tareas programadas
          </CardTitle>
          <CardDescription>
            Lo que el worker corre cada minuto: cuándo corrió por última vez, cómo terminó y sus
            fallos del último día.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobsFailed ? (
            <p data-diagnosis-jobs-unavailable>
              No se pudo leer el estado de las tareas. El resto del diagnóstico sigue abajo.
            </p>
          ) : jobs === null ? null : jobs.length === 0 ? (
            <ScreenEmpty icon="activity" title="El worker no ha registrado ninguna corrida">
              Si la plataforma lleva un rato desplegada, eso quiere decir que el worker no está
              corriendo.
            </ScreenEmpty>
          ) : (
            <ul>
              {jobs.map((job) => (
                <li key={job.job_name} data-diagnosis-job={job.job_name}>
                  <Badge variant={jobHealthTone(job)}>{jobLabel(job.job_name)}</Badge>{' '}
                  {jobHealthLine(job)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Canales de entrega
          </CardTitle>
          <CardDescription>
            Contadores por tipo de aviso. Nada de esto pertenece a una persona, y responde «¿está
            caído el canal entero?» antes de perseguir un aviso suelto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {circuits.length === 0 ? (
            <ScreenEmpty icon="activity" title="Ningún canal ha reportado entregas">
              Todavía no hay ventanas de entrega registradas. No es una falla: es que aún no se ha
              enviado nada.
            </ScreenEmpty>
          ) : (
            <Table scrollAreaLabel="Canales de entrega">
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de aviso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Aciertos</TableHead>
                  <TableHead>Fallas</TableHead>
                  <TableHead>Reabre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circuits.map((circuit) => (
                  <TableRow key={circuit.event_type}>
                    <TableCell>
                      <code>{circuit.event_type}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={circuitTone(circuit.state)}>{circuit.state}</Badge>
                    </TableCell>
                    <TableCell>{circuit.success_count}</TableCell>
                    <TableCell>{circuit.failure_count}</TableCell>
                    <TableCell>
                      {circuit.opened_until ? formatInstant(circuit.opened_until) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Operaciones
          </CardTitle>
          <CardDescription>
            Identificadores, estados, marcas de tiempo, errores y reintentos. Nunca el contenido de
            un aviso ni la respuesta de un comando: esta pantalla existe para diagnosticar sin abrir
            el dato de nadie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="diagnosis-source">Tipo</FieldLabel>
              <Select
                value={source}
                onValueChange={(next) =>
                  setSource((next ?? ANY) as SupportOperationSourceKind | typeof ANY)
                }
              >
                <SelectTrigger id="diagnosis-source">
                  <SelectValue>{sourceFilterLabel(source)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Todo</SelectItem>
                  {SUPPORT_OPERATION_SOURCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {sourceLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="diagnosis-state">Estado</FieldLabel>
              <Select
                value={operationState}
                onValueChange={(next) =>
                  setOperationState((next ?? ANY) as SupportOperationState | typeof ANY)
                }
              >
                <SelectTrigger id="diagnosis-state">
                  <SelectValue>{operationStateFilterLabel(operationState)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Todo</SelectItem>
                  {SUPPORT_OPERATION_STATES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {operationStateLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <form onSubmit={searchIdentifier} data-diagnosis-identifier-form noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="diagnosis-identifier">Identificador del sujeto</FieldLabel>
                <Input
                  id="diagnosis-identifier"
                  value={identifierDraft}
                  onChange={(event) => setIdentifierDraft(event.target.value)}
                  placeholder="019a7000-0000-7000-8000-000000000001"
                  autoComplete="off"
                />
                {identifierIssue ? (
                  <FieldError>
                    Escribe el identificador completo, como aparece en la operación.
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>
            <div data-form-actions>
              <Button type="submit" size="sm">
                Buscar sus operaciones
              </Button>
              {identifier !== '' ? (
                <Button type="button" size="sm" variant="outline" onClick={clearIdentifier}>
                  Ver todas
                </Button>
              ) : null}
            </div>
          </form>

          {operations.length === 0 ? (
            <ScreenEmpty icon="search" title="Nada que revisar con esos filtros" role="status">
              Con este tipo y este estado no hay ninguna operación. Cambia los filtros para ampliar
              la búsqueda.
            </ScreenEmpty>
          ) : (
            <Table scrollAreaLabel="Operaciones">
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Qué</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cuándo</TableHead>
                  <TableHead>Intentos</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operations.map((operation) => (
                  <TableRow key={`${operation.source}-${operation.reference_id}`}>
                    <TableCell>{sourceLabel(operation.source)}</TableCell>
                    <TableCell>
                      <code>{operation.label}</code>
                      {/* c1: the identifiers, whole in the title, so they can be searched. */}
                      <div data-operation-ids>
                        <span title={operation.reference_id}>
                          ref <code>{shortIdentifier(operation.reference_id)}</code>
                        </span>{' '}
                        ·{' '}
                        <span title={operation.subject_id ?? undefined} data-operation-subject>
                          {subjectLine(operation)}
                        </span>{' '}
                        {operation.subject_id && identifier === '' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label={`Ver solo las operaciones de ${operation.subject_id}`}
                            onClick={() => {
                              setIdentifierDraft(operation.subject_id ?? '')
                              setIdentifier(operation.subject_id ?? '')
                            }}
                          >
                            Solo esta
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={operationStateTone(operation.state)}>
                        {operationStateLabel(operation.state)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatInstant(operation.occurred_at)}</TableCell>
                    <TableCell>{operation.attempt_count}</TableCell>
                    <TableCell>
                      {operation.last_error_code ? <code>{operation.last_error_code}</code> : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {cursor ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={appending}
              onClick={() => void loadMore()}
            >
              {appending ? 'Cargando…' : 'Ver más operaciones'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return supportDiagnosisMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return supportDiagnosisMessage(error.code)
  return supportDiagnosisMessage('upstream-unavailable')
}

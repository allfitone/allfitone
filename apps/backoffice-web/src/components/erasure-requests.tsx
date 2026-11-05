'use client'

/**
 * `HU-BO-032` — following what people asked us to erase.
 *
 * Three decisions, and none of them is layout.
 *
 * **The panel opens on what is still owed.** A tracking screen that opens on the
 * archive invites reading history instead of finishing work, so the pending half
 * loads first and the resolved half is a deliberate second click.
 *
 * **Late is stated, not implied.** The summary counts how many requests are past
 * the thirty days before any row is drawn, and each row carries the days left
 * rather than a date the reader has to subtract from today.
 *
 * **A suspended category is not a forgotten one.** It reads as held by a legal
 * obligation, because an officer who reads it as pending will try to finish a
 * disposition the law says to keep.
 *
 * The person is an identifier here. This screen tracks the request; reading what
 * the person recorded is a break-glass window, and a different screen.
 *
 * Suspending is offered where something of a kind the platform deletes still waits.
 * It opens the hold form on that person, with those kinds marked: a hold keeps the
 * person's data of those kinds, this request's and whatever they ask to delete while
 * it lasts. The form is `legal-hold-form.tsx`, shared with «Retenciones legales».
 * Releasing says what it will do before it does it: the erasure continues.
 *
 * Applying a hold opens no view of anything. The refusal for whoever already asked
 * to read that person's file is its own message and not a generic "no": being told
 * "you cannot" when the real answer is "not you, because you asked to look" sends
 * an officer hunting for a missing duty they already have.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { LegalHoldForm } from './legal-hold-form'
import { LegalHolds } from './legal-holds'
import { ScreenEmpty, ScreenLoading, ScreenRefusal } from './screen-state'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { useCallback, useEffect, useState } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type ErasureRequestPage,
} from '@/lib/backoffice-api'
import {
  emptyMessage,
  erasureMessage,
  holdableCategories,
  holdableKinds,
  appendPage,
  nextPageCursor,
  panelSummary,
  requestRows,
  urgencyTone,
  type ErasureRequest,
  type ErasureRequestState,
} from '@/lib/erasure-requests'
import {
  emptyHold,
  holdApplication,
  holdIssue,
  type HoldDraft,
  type HoldIssue,
} from '@/lib/legal-holds'
import { isRefusal } from '@/lib/screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

const HALVES: readonly { status: ErasureRequestState; label: string }[] = [
  { status: 'open', label: 'Pendientes' },
  { status: 'closed', label: 'Resueltas' },
]

export function ErasureRequests() {
  const [status, setStatus] = useState<ErasureRequestState>('open')
  const [state, setState] = useState<LoadState>('loading')
  const [page, setPage] = useState<ErasureRequestPage | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [holding, setHolding] = useState<ErasureRequest | null>(null)
  const [draft, setDraft] = useState<HoldDraft>(emptyHold())
  const [issue, setIssue] = useState<HoldIssue | null>(null)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailure, setMoreFailure] = useState<string | null>(null)
  // Remounts the holds section when a hold applied from a request changes it.
  const [holdsVersion, setHoldsVersion] = useState(0)

  const load = useCallback(async (half: ErasureRequestState) => {
    setState('loading')
    try {
      setPage(await backofficeApi.erasureRequests({ status: half }))
      setState('ready')
    } catch (caught) {
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
    void load(status)
  }, [load, status])

  // HU-BO-032: the next page continues after the last row and is appended, not swapped in.
  async function loadMore() {
    if (!page) return
    const cursor = nextPageCursor(page, status)
    if (!cursor) return
    setLoadingMore(true)
    setMoreFailure(null)
    try {
      const next = await backofficeApi.erasureRequests({ status, ...cursor })
      setPage((current) => (current ? appendPage(current, next) : next))
    } catch (caught) {
      if (caught instanceof BackofficeApiError && caught.status === 401) {
        window.location.assign('/')
        return
      }
      setMoreFailure(failureMessage(caught))
    } finally {
      setLoadingMore(false)
    }
  }

  const rows = page ? requestRows(page) : []
  const byId = new Map((page?.items ?? []).map((request) => [request.id, request]))

  async function suspend() {
    const broken = holdIssue(draft)
    if (broken) {
      setIssue(broken)
      return
    }
    setIssue(null)
    setBusy(true)
    try {
      await backofficeApi.applyLegalHold(holdApplication(draft), newBackofficeCommand())
      setHolding(null)
      setDraft(emptyHold())
      setHoldsVersion((version) => version + 1)
      setFailure(null)
      await load(status)
    } catch (caught) {
      setFailure(failureMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function release(holdId: string) {
    setBusy(true)
    try {
      await backofficeApi.releaseLegalHold(holdId, newBackofficeCommand())
      setReleasing(null)
      setHoldsVersion((version) => version + 1)
      setFailure(null)
      await load(status)
    } catch (caught) {
      setFailure(failureMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-erasure-requests>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Solicitudes de eliminación de datos
          </CardTitle>
          <CardDescription>
            Qué pidió borrar cada persona, qué falta para cerrarlo y cómo se resolvió, categoría por
            categoría. El plazo objetivo es de 30 días desde que llegó la solicitud. La persona
            aparece por identificador: esta pantalla sigue la solicitud, no abre sus datos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[status]}
            onValueChange={(values) => {
              const next = values[0]
              if (next && next !== status) setStatus(next)
            }}
            aria-label="Qué mitad del seguimiento ver"
            data-erasure-halves
          >
            {HALVES.map((half) => (
              <ToggleGroupItem key={half.status} value={half.status}>
                {half.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      {state === 'loading' ? <ScreenLoading label="Leyendo el seguimiento" /> : null}

      {state === 'failed' && failure && refused ? (
        <ScreenRefusal duties={['manage_privacy_requests']} data-erasure-failure>
          {failure}
        </ScreenRefusal>
      ) : failure ? (
        <Alert live="assertive" variant="danger" data-erasure-failure>
          <AlertTitle>
            {state === 'failed' ? 'No se pudo leer el seguimiento' : 'No se pudo completar'}
          </AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      {state === 'ready' && page ? (
        <>
          {/* The whole answer, late requests counted, before any row. */}
          <Alert live="polite" variant={hasLate(rows) ? 'warning' : 'info'} data-erasure-summary>
            <AlertTitle>
              {hasLate(rows) ? 'Hay solicitudes fuera de plazo' : 'Estado del seguimiento'}
            </AlertTitle>
            <AlertDescription>{panelSummary(page, status)}</AlertDescription>
          </Alert>

          {rows.length === 0 ? (
            <ScreenEmpty
              icon="remove"
              title="Nada que seguir aquí"
              role="status"
              data-erasure-empty
            >
              {emptyMessage(status)}
            </ScreenEmpty>
          ) : (
            <Table scrollAreaLabel="Solicitudes de eliminación" data-erasure-table>
              <TableCaption>Solicitudes de eliminación</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Solicitada</TableHead>
                  <TableHead>Fecha objetivo</TableHead>
                  <TableHead>Plazo</TableHead>
                  <TableHead>Falta</TableHead>
                  <TableHead>Resolución</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-erasure-row data-urgency={row.urgency}>
                    <TableCell data-erasure-subject>
                      <code>{row.subject}</code>
                    </TableCell>
                    <TableCell>{row.opened}</TableCell>
                    <TableCell>{row.due}</TableCell>
                    <TableCell>
                      <Badge variant={urgencyTone(row.urgency)}>{row.urgencyLabel}</Badge>
                    </TableCell>
                    <TableCell data-erasure-missing>{row.missing}</TableCell>
                    <TableCell data-erasure-resolution>
                      <ul>
                        {row.resolution.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <div data-erasure-actions>
                        {holdableCategories(byId.get(row.id) ?? emptyRequest).length > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              const request = byId.get(row.id) ?? null
                              setHolding(request)
                              setDraft(
                                request
                                  ? emptyHold(request.subject_person_id, holdableKinds(request))
                                  : emptyHold(),
                              )
                              setIssue(null)
                            }}
                          >
                            Suspender
                          </Button>
                        ) : null}
                        {heldBy(byId.get(row.id) ?? emptyRequest).map((held) => (
                          <Button
                            key={held}
                            type="button"
                            variant="outline"
                            disabled={busy}
                            data-erasure-release
                            onClick={() => setReleasing(held)}
                          >
                            Liberar
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {page.has_more ? (
            <div data-form-actions>
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                data-erasure-more
              >
                {loadingMore ? 'Cargando…' : 'Ver más solicitudes'}
              </Button>
            </div>
          ) : null}

          {moreFailure ? (
            <Alert live="assertive" variant="danger" data-erasure-more-failure>
              <AlertTitle>No se cargaron más</AlertTitle>
              <AlertDescription>{moreFailure}</AlertDescription>
            </Alert>
          ) : null}
        </>
      ) : null}

      {releasing ? (
        <Alert live="polite" variant="warning" data-erasure-release-confirm>
          <AlertTitle>Al liberar, la eliminación sigue su curso</AlertTitle>
          <AlertDescription>
            Lo que retiene pasa a otra retención vigente sobre los mismos datos, si la hay; si no,
            se borra como la persona pidió, en el siguiente minuto. Liberar no se deshace, y la
            retención queda registrada.
            <div data-erasure-confirm-actions>
              <Button type="button" disabled={busy} onClick={() => void release(releasing)}>
                Confirmar liberación
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setReleasing(null)}
              >
                Cancelar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {holding ? (
        <LegalHoldForm
          draft={draft}
          onChange={setDraft}
          issue={issue}
          busy={busy}
          subjectFixed
          submitLabel="Suspender"
          onSubmit={() => void suspend()}
          onCancel={() => {
            setHolding(null)
            setIssue(null)
          }}
        />
      ) : null}

      {/* Same duty: an officer refused the requests is refused the holds, and told once. */}
      {state === 'failed' && refused ? null : (
        <LegalHolds key={holdsVersion} onChange={() => void load(status)} />
      )}
    </div>
  )
}

const emptyRequest = { categories: [] } as unknown as ErasureRequest

/** The holds stopping anything in this request, each offered once. */
function heldBy(request: ErasureRequest): string[] {
  const holds = new Set<string>()
  for (const category of request.categories) {
    if (category.hold) holds.add(category.hold.id)
  }
  return [...holds]
}

function hasLate(rows: readonly { urgency: string }[]): boolean {
  return rows.some((row) => row.urgency === 'overdue')
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return erasureMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return erasureMessage(error.code)
  return erasureMessage('upstream-unavailable')
}

'use client'

/**
 * `HU-BO-033` — the legal holds an officer answers for.
 *
 * Three decisions, and none of them is layout.
 *
 * **It opens on the holds in force, the one ending soonest first.** A hold ends on its
 * own date, so the one about to end is the one to act on: renewing an order means
 * applying a second hold over the same data before the first one lapses, and the last
 * week is marked for that.
 *
 * **A hold is applied from a person, not from a request.** The order arrives before
 * anybody asks to delete anything; waiting for a request would be holding too late.
 *
 * **Releasing says what it will do before it does it.** What the hold keeps passes to
 * another hold in force over the same data, or is deleted as the person asked. Nobody
 * should learn that from the person's data disappearing.
 *
 * The person is an identifier, as in the erasure panel: reading what they recorded is a
 * break-glass window, and a different screen. Reading this list records an access per
 * person it names, in the database, before anything is shown.
 *
 * It is the erasure screen's second section rather than an entry of its own: it needs
 * the same duty, and the menu is full. A hold applied or released here changes what the
 * requests above say, so the screen is told.
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
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useCallback, useEffect, useState } from 'react'

import {
  BackofficeApiError,
  BackofficeNetworkError,
  backofficeApi,
  newBackofficeCommand,
  type LegalHoldPage,
} from '@/lib/backoffice-api'
import {
  emptyHold,
  holdApplication,
  holdIssue,
  holdMessage,
  holdRows,
  holdsEmptyMessage,
  holdsSummary,
  holdTone,
  type HoldDraft,
  type HoldIssue,
  type LegalHoldState,
} from '@/lib/legal-holds'
import { isRefusal } from '@/lib/screen-state'
import { LegalHoldForm } from './legal-hold-form'
import { ScreenEmpty, ScreenLoading, ScreenRefusal } from './screen-state'

type LoadState = 'loading' | 'ready' | 'failed'

const HALVES: readonly { status: LegalHoldState; label: string }[] = [
  { status: 'active', label: 'Vigentes' },
  { status: 'ended', label: 'Terminadas' },
]

export function LegalHolds({ onChange }: { onChange?: () => void } = {}) {
  const [status, setStatus] = useState<LegalHoldState>('active')
  const [state, setState] = useState<LoadState>('loading')
  const [page, setPage] = useState<LegalHoldPage | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [refused, setRefused] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<HoldDraft>(emptyHold())
  const [issue, setIssue] = useState<HoldIssue | null>(null)
  const [releasing, setReleasing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (half: LegalHoldState) => {
    setState('loading')
    try {
      setPage(await backofficeApi.legalHolds({ status: half }))
      setFailure(null)
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

  const rows = page ? holdRows(page) : []

  async function apply() {
    const broken = holdIssue(draft)
    if (broken) {
      setIssue(broken)
      return
    }
    setIssue(null)
    setBusy(true)
    try {
      await backofficeApi.applyLegalHold(holdApplication(draft), newBackofficeCommand())
      setDrafting(false)
      setDraft(emptyHold())
      setFailure(null)
      onChange?.()
      if (status === 'active') await load('active')
      else setStatus('active')
    } catch (caught) {
      setRefused(false)
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
      setFailure(null)
      onChange?.()
      await load(status)
    } catch (caught) {
      setRefused(false)
      setFailure(failureMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-legal-holds>
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Retenciones legales
          </CardTitle>
          <CardDescription>
            Qué datos de quién se conservan por una orden o un requerimiento, hasta cuándo y cuántos
            borrados están deteniendo. Una retención vence sola en su fecha: para prorrogarla,
            aplica otra sobre los mismos datos antes de que venza. La persona aparece por
            identificador; esta pantalla no abre sus datos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div data-legal-holds-controls>
            <ToggleGroup
              value={[status]}
              onValueChange={(values) => {
                const next = values[0]
                if (next && next !== status) setStatus(next)
              }}
              aria-label="Qué retenciones ver"
            >
              {HALVES.map((half) => (
                <ToggleGroupItem key={half.status} value={half.status}>
                  {half.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setDrafting(true)
                setDraft(emptyHold())
                setIssue(null)
              }}
            >
              Nueva retención
            </Button>
          </div>
        </CardContent>
      </Card>

      {drafting ? (
        <LegalHoldForm
          draft={draft}
          onChange={setDraft}
          issue={issue}
          busy={busy}
          submitLabel="Aplicar retención"
          onSubmit={() => void apply()}
          onCancel={() => {
            setDrafting(false)
            setIssue(null)
          }}
        />
      ) : null}

      {state === 'loading' ? <ScreenLoading label="Leyendo las retenciones" /> : null}

      {failure && refused ? (
        <ScreenRefusal duties={['manage_privacy_requests']} data-legal-holds-failure>
          {failure}
        </ScreenRefusal>
      ) : failure ? (
        <Alert live="assertive" variant="danger" data-legal-holds-failure>
          <AlertTitle>
            {state === 'failed' ? 'No se pudieron leer las retenciones' : 'No se pudo completar'}
          </AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      {state === 'ready' && page ? (
        <>
          <Alert live="polite" variant="info" data-legal-holds-summary>
            <AlertTitle>Estado de las retenciones</AlertTitle>
            <AlertDescription>{holdsSummary(page, status)}</AlertDescription>
          </Alert>

          {rows.length === 0 ? (
            <ScreenEmpty
              icon="calendar"
              title="Nada retenido aquí"
              role="status"
              data-legal-holds-empty
            >
              {holdsEmptyMessage(status)}
            </ScreenEmpty>
          ) : (
            <Table scrollAreaLabel="Retenciones legales" data-legal-holds-table>
              <TableCaption>Retenciones legales</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Datos y alcance</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Vigencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-legal-hold-row data-state={row.state}>
                    <TableCell data-legal-hold-subject>
                      {row.subject ? <code>{row.subject}</code> : '—'}
                    </TableCell>
                    <TableCell data-legal-hold-scope>
                      {row.kinds}
                      <br />
                      <small>{row.scope}</small>
                    </TableCell>
                    <TableCell>
                      {row.reason}
                      <br />
                      <small>{row.reference}</small>
                    </TableCell>
                    <TableCell>
                      <Badge variant={holdTone(row.state)}>{row.stateLabel}</Badge>
                      <br />
                      <small>{row.holding}</small>
                      {row.releasable ? (
                        <div data-legal-hold-actions>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setReleasing(row.id)}
                          >
                            Liberar
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}

      {releasing ? (
        <Alert live="polite" variant="warning" data-legal-hold-release-confirm>
          <AlertTitle>Al liberar, la eliminación sigue su curso</AlertTitle>
          <AlertDescription>
            Lo que esta retención detiene pasa a otra retención vigente sobre los mismos datos, si
            la hay; si no, se borra como la persona pidió, en el siguiente minuto. Liberar no se
            deshace, y la retención queda registrada.
            <div data-legal-hold-confirm-actions>
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
    </div>
  )
}

function failureMessage(error: unknown): string {
  if (error instanceof BackofficeNetworkError) return holdMessage('network-unavailable')
  if (error instanceof BackofficeApiError) return holdMessage(error.code)
  return holdMessage('upstream-unavailable')
}

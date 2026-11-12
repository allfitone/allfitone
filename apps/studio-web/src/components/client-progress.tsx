'use client'

/**
 * `HU-STUDIO-056`. How a client's training is going, from what she shares with
 * the coach who attends her: her weeks or months with their sessions, time, work
 * sets, volume and where those sets fell, and each movement's best against the
 * period before it.
 *
 * Four rules, and every one of them is a refusal to round.
 *
 * **A figure that could not be computed is absent, never approximate.** The
 * contract says it in the data: `volume_kg` is null when nothing in the period
 * was weighed, `best_e1rm_kg` when no set was in the formula's range, and
 * `change_kg` when there is no earlier best to compare against. A zero in any of
 * those places would be a claim — that she lifted nothing, or held steady — built
 * out of an absence.
 *
 * **A movement only she can name keeps its row.** `name` arrives null and the
 * figures counted it, so dropping the row would change them and naming it would
 * read something she did not share.
 *
 * **Nothing is drawn as a chart.** `bests` carries a null for every period a
 * movement was not trained in, and in a line or a bar an absence is precisely
 * what gets painted as a zero or interpolated away. A chart can come later with
 * that rule written into it; a table cannot get it wrong.
 *
 * **The screen computes nothing of its own.** No totals, no averages, no sums
 * across periods. Every number on it is one the server computed from data this
 * coach may read — which is what keeps criterion 4 true: a figure here can never
 * become an indirect way to read what she did not share.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Skeleton } from '@allfitone/react/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath } from '@/lib/client-card'
import {
  changeLine,
  changeTone,
  estimateLine,
  kilos,
  movementIsUnnamed,
  movementName,
  musclesLine,
  nothingTrained,
  periodLabel,
  trainedTimeLine,
  volumeLine,
} from '@/lib/client-progress'
import { readerTimeZone } from '@/lib/reader-zone'
import type {
  ClientProgress,
  ClientProgressMovement,
  ClientProgressPeriod,
  ProgressPeriod,
} from '@/lib/studio-api'
import { clientProgressQueryOptions, isStudioForbidden, isStudioNotFound } from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'

/*
 * The contract's ceiling, and no control for it. Twelve weeks is a season and
 * twelve months a year; a knob for the count would be a question nobody asked,
 * and every value of it costs her another recorded read.
 */
const PERIOD_COUNT = 12

const PERIODS: readonly { value: ProgressPeriod; label: string }[] = [
  { value: 'week', label: 'Por semana' },
  { value: 'month', label: 'Por mes' },
]

export function ClientProgressScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const [period, setPeriod] = useState<ProgressPeriod>('week')
  /*
   * The zone is required, and it decides which week a session falls in. The
   * reader's is the only one available — the product stores none for a gym — and
   * `UTC` is the honest fallback when the browser will not say, because it is a
   * zone the contract accepts rather than a guess at hers.
   */
  const zone = readerTimeZone()
  const query = useQuery(
    clientProgressQueryOptions(current.organization_id, params.personId, {
      timezone: zone ?? 'UTC',
      period,
      count: PERIOD_COUNT,
    }),
  )
  const cardPath = clientCardPath(current.organization_id, params.personId)
  const directoryPath = `/organizations/${current.organization_id}/clients`

  function changePeriod(values: ProgressPeriod[]) {
    const next = values[0]
    if (!next || next === period) return
    setPeriod(next)
  }

  if (query.isPending) return <LoadingState />
  if (isStudioForbidden(query.error)) return <ScopeRequiredState cardPath={cardPath} />
  if (isStudioNotFound(query.error)) return <UnreachableState directoryPath={directoryPath} />
  if (!query.data) return <FailureState onRetry={() => void query.refetch()} />

  const progress = query.data

  return (
    <div data-client-progress-screen>
      <WorkspacePageHeader
        description="Cómo va su entrenamiento, calculado en el momento de leerlo y solo con las sesiones que te autorizó. Lo que no se puede calcular con eso no aparece: no se entrega aproximado."
        actions={
          <>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
              data-client-progress-card-link
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a su ficha
            </Link>
            <Link
              href={directoryPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a clientes
            </Link>
          </>
        }
      />

      <ToggleGroup value={[period]} onValueChange={changePeriod} aria-label="Agrupar el progreso">
        {PERIODS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {query.isFetching ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando su progreso…
        </p>
      ) : null}

      {nothingTrained(progress.periods) ? (
        <NothingTrained period={period} />
      ) : (
        <PeriodsPanel progress={progress} period={period} zone={zone} />
      )}

      {progress.movements.length > 0 ? <MovementsPanel movements={progress.movements} /> : null}
    </div>
  )
}

/**
 * The periods, oldest first, as the operation answers them: a progression reads
 * forward in time.
 */
/**
 * A block per period rather than a table row, and measured before deciding.
 *
 * Six figures with their labels ask for about 1 200px of `max-content`, and a
 * Studio screen is 1024px wide — the reading measure the product sets for every
 * screen. A table here never rendered: the register fell back to cards at every
 * width, so the table branch was code nobody saw. Blocks carry the same figures
 * and fit any width.
 */
function PeriodsPanel({
  progress,
  period,
  zone,
}: {
  progress: ClientProgress
  period: ProgressPeriod
  zone: string | null
}) {
  return (
    <Card data-client-progress-periods>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {period === 'week' ? 'Semana a semana' : 'Mes a mes'}
        </CardTitle>
        {/* Said once, so no cell has to explain itself: the volume is the column
            that goes missing, and the zone is what decides the boundaries. */}
        <CardDescription>
          El volumen aparece solo cuando algo en el periodo se pesó; un periodo de peso corporal no
          tiene volumen, y no es cero.{' '}
          {zone
            ? `Las ${period === 'week' ? 'semanas' : 'meses'} se calculan en la zona ${zone}.`
            : 'Tu navegador no dice tu zona horaria, así que los periodos se calculan en UTC.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul data-client-progress-period-cards>
          {progress.periods.map((entry) => (
            <li key={entry.starts_on}>
              <PeriodCard entry={entry} period={period} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function PeriodCard({ entry, period }: { entry: ClientProgressPeriod; period: ProgressPeriod }) {
  const muscles = musclesLine(entry.muscles)
  const volume = volumeLine(entry.volume_kg)
  const time = trainedTimeLine(entry.trained_seconds)
  return (
    <article data-client-progress-period>
      <h3 data-client-progress-period-name>{periodLabel(period, entry)}</h3>
      <dl data-client-progress-facts>
        <dt>Sesiones</dt>
        <dd>{entry.sessions}</dd>

        {time ? (
          <>
            <dt>Tiempo</dt>
            <dd>{time}</dd>
          </>
        ) : null}

        <dt>Series de trabajo</dt>
        <dd>{entry.work_sets}</dd>

        <dt>Volumen</dt>
        <dd data-client-progress-volume>{volume ?? 'Sin peso registrado'}</dd>

        {muscles ? (
          <>
            <dt>Dónde cayeron</dt>
            <dd>{muscles}</dd>
          </>
        ) : null}
      </dl>
    </article>
  )
}

/**
 * Each movement's best in its latest period, best first, with how it moved and
 * the estimate when the window had a set to estimate from.
 *
 * The per-period series `bests` is deliberately not drawn: its nulls are periods
 * a movement was not trained in, and that is the one thing a chart gets wrong.
 */
function MovementsPanel({ movements }: { movements: readonly ClientProgressMovement[] }) {
  /*
   * Its own, not the screen's. The hook watches one register and decides for
   * it; sharing one between two panels let the periods — which never fit —
   * decide for these four narrow columns, which do.
   */
  const { compact, measuredRef } = useCompactTable<HTMLDivElement>()
  return (
    <Card ref={measuredRef} data-client-progress-movements>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Lo que está levantando
        </CardTitle>
        <CardDescription>
          El mejor levantamiento de cada movimiento en su último periodo, contra el periodo
          anterior. El máximo estimado sale de la fórmula de Epley y aparece solo cuando alguna
          serie estuvo entre una y doce repeticiones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {compact ? (
          <ul data-client-progress-movement-cards>
            {movements.map((movement) => (
              <li key={movement.movement_id}>
                <MovementCard movement={movement} />
              </li>
            ))}
          </ul>
        ) : (
          <Table
            aria-label="Progreso por movimiento"
            scrollAreaLabel="Tabla de progreso por movimiento"
            data-studio-register="client-progress-movements"
          >
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead>Movimiento</TableHead>
                <TableHead>Mejor</TableHead>
                <TableHead>Cambio</TableHead>
                <TableHead>Máximo estimado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((movement) => {
                const change = changeLine(movement.change_kg)
                const estimate = estimateLine(movement.best_e1rm_kg)
                return (
                  <TableRow key={movement.movement_id} data-client-progress-movement>
                    <TableCell>
                      <MovementTitle movement={movement} />
                    </TableCell>
                    <TableCell>{kilos(movement.best_kg)}</TableCell>
                    <TableCell>
                      {change ? (
                        <Badge variant={changeTone(movement.change_kg)}>{change}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{estimate ?? '—'}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function MovementCard({ movement }: { movement: ClientProgressMovement }) {
  const change = changeLine(movement.change_kg)
  const estimate = estimateLine(movement.best_e1rm_kg)
  return (
    <article data-client-progress-movement>
      <div data-client-progress-movement-head>
        <MovementTitle movement={movement} />
        {change ? <Badge variant={changeTone(movement.change_kg)}>{change}</Badge> : null}
      </div>
      <dl data-client-progress-facts>
        <dt>Mejor</dt>
        <dd>{kilos(movement.best_kg)}</dd>

        {estimate ? (
          <>
            <dt>Máximo estimado</dt>
            <dd>{estimate}</dd>
          </>
        ) : null}
      </dl>
    </article>
  )
}

/**
 * A movement she alone can name says so, rather than carrying an invented name
 * or being left out of a list its figures are part of.
 */
function MovementTitle({ movement }: { movement: ClientProgressMovement }) {
  const unnamed = movementIsUnnamed(movement.name)
  return (
    <strong data-client-progress-movement-name data-unnamed={unnamed || undefined}>
      {movementName(movement.name)}
    </strong>
  )
}

/**
 * Nothing trained in the whole window. Said once rather than drawn as a dozen
 * rows of zeros, which read as a screen that failed.
 *
 * Both readings are offered, because the operation cannot tell them apart from
 * here: she trained nothing, or nothing she trained is in what she shares.
 */
function NothingTrained({ period }: { period: ProgressPeriod }) {
  const window = period === 'week' ? 'doce semanas' : 'doce meses'
  return (
    <Card data-client-progress-periods>
      <CardContent>
        <Empty data-client-progress-nothing>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="activity" decorative />
            </EmptyMedia>
            <EmptyTitle>No hay nada que medir en las últimas {window}</EmptyTitle>
            <EmptyDescription>
              Puede ser que no haya entrenado en ese tiempo, o que lo que entrenó no esté entre lo
              que te autorizó. Desde aquí no se puede distinguir, y no vamos a suponerlo. Prueba con
              el otro periodo si crees que la ventana es corta.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div data-client-progress-screen data-client-progress-loading>
      <Skeleton data-client-progress-header-placeholder />
      <Skeleton data-client-progress-panel-placeholder />
      <Skeleton data-client-progress-panel-placeholder />
    </div>
  )
}

/**
 * Criterion 1 at its hardest edge: with neither category shared there is nothing
 * a figure could be computed from, so the operation refuses rather than
 * answering zeros. No retry — it would refuse again and record another attempt.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-progress-screen>
      <Alert variant="warning" live="polite" data-client-progress-scope-required>
        <AlertTitle>No te autorizó nada con lo que medir su progreso</AlertTitle>
        <AlertDescription>
          Estas cifras se calculan con sus sesiones, y hace falta al menos uno de los dos permisos:
          su entrenamiento con nosotros o su historial anterior. Sin ninguno no se entrega nada, ni
          en cero. El intento queda registrado y ella puede verlo. En su ficha está qué categorías
          sí te autorizó.
        </AlertDescription>
        <AlertAction>
          <Link
            href={cardPath}
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Ver su ficha
          </Link>
        </AlertAction>
      </Alert>
    </div>
  )
}

function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-progress-screen>
      <Empty data-client-progress-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos este progreso</EmptyTitle>
          <EmptyDescription>
            El progreso de una persona solo lo abre quien la atiende. Vuelve a clientes para elegir
            a alguien.
          </EmptyDescription>
        </EmptyHeader>
        <Link
          href={directoryPath}
          data-slot="button"
          data-variant="outline"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Volver a clientes
        </Link>
      </Empty>
    </div>
  )
}

function FailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-client-progress-screen>
      <Alert variant="danger" live="polite" data-client-progress-failure>
        <AlertTitle>No pudimos calcular su progreso</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Lo que te autorizó sigue igual.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}

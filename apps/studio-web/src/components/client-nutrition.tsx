'use client'

/**
 * `HU-STUDIO-068`. The meals a client shares with the coach who attends her, so
 * he can follow what she eats with what she actually recorded.
 *
 * **Two reads, one screen** (`HU-STUDIO-069`). `nutrition_intake` names her
 * meals and her daily totals, and the card offers one door, so both are read
 * here for the same range: the days added up above, the meals they add up below.
 * There is no chart: a line or a bar draws a day with nothing as zero, and a gap
 * may be a day she did not record or one she keeps to herself.
 *
 * **One range, chosen by pressing.** The screen opens on her last seven days and
 * asks again only when somebody presses «Consultar»: every read is recorded for
 * her, so typing a date must not write her a line per keystroke. A range is at
 * most thirty-one of her days, which the form says before the API has to.
 *
 * **Only the owner of the relationship reads this** (criterion 4). The API
 * answers 404 to the owner and admins as to anybody else, and the screen draws
 * that like a person it cannot reach, never like a refusal that confirms her.
 *
 * **Never cached** (criterion 5): each range is read when asked for and dropped
 * when left. The rules of what is drawn are in `client-nutrition.ts`.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
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
import { Field, FieldError, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Fragment, useId, useState, type ReactNode } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientCardPath } from '@/lib/client-card'
import {
  NUTRITION_RANGE_LIMIT,
  defaultNutritionRange,
  mealDays,
  mealItemRows,
  mealPhoto,
  mealTimeLine,
  mealTitle,
  nutritionDayHeading,
  rangeProblem,
  rangeProblemText,
  summaryDays,
  type MealDay,
  type NutritionRange,
  type RangeProblem,
} from '@/lib/client-nutrition'
import type { ClientNutritionMeal } from '@/lib/studio-api'
import {
  clientNutritionMealsQueryOptions,
  clientNutritionSummariesQueryOptions,
  flattenById,
  isStudioForbidden,
  isStudioNotFound,
} from '@/lib/studio-query'

const MEALS_PAGE = 20

export function ClientNutritionScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string }>()
  const organizationId = current.organization_id
  const [range, setRange] = useState<NutritionRange>(() => defaultNutritionRange(new Date()))
  const meals = useInfiniteQuery(
    clientNutritionMealsQueryOptions(organizationId, params.personId, range, MEALS_PAGE),
  )
  const summaries = useQuery(
    clientNutritionSummariesQueryOptions(organizationId, params.personId, range),
  )
  const cardPath = clientCardPath(organizationId, params.personId)
  const directoryPath = `/organizations/${organizationId}/clients`

  // Both reads belong to one category, so a refusal of either is the category's.
  if (isStudioForbidden(meals.error) || isStudioForbidden(summaries.error)) {
    return <ScopeRequiredState cardPath={cardPath} />
  }
  if (isStudioNotFound(meals.error) || isStudioNotFound(summaries.error)) {
    return <UnreachableState directoryPath={directoryPath} />
  }

  const first = meals.data?.pages[0]
  const days = mealDays(flattenById(meals.data))
  const totals = summaryDays(summaries.data?.data ?? [])
  const summariesFailed = summaries.isError
  const nothing = days.length === 0 && totals.length === 0 && !summariesFailed
  const timed = days.some((day) => day.meals.some((meal) => meal.timezone !== null))

  return (
    <div data-client-nutrition-screen>
      <WorkspacePageHeader
        description="Lo que registra que come, en los días que elijas. Es un permiso aparte: ni el de entrenamiento ni el de progreso corporal lo incluyen."
        actions={
          <>
            <Link
              href={cardPath}
              data-slot="button"
              data-variant="outline"
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

      <RangeForm range={range} onApply={setRange} />

      {meals.isPending || summaries.isPending ? (
        <div data-client-nutrition-loading>
          <Skeleton data-client-nutrition-panel-placeholder />
        </div>
      ) : !first ? (
        <FailureState
          onRetry={() => {
            void meals.refetch()
            if (summariesFailed) void summaries.refetch()
          }}
        />
      ) : nothing ? (
        <Empty data-client-nutrition-nothing>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="person" decorative />
            </EmptyMedia>
            <EmptyTitle>No hay comidas suyas que podamos mostrarte en estos días</EmptyTitle>
            {/* Both readings, and no choosing between them. */}
            <EmptyDescription>
              Puede ser que no haya registrado comidas en estos días, o que la versión del permiso
              que tienes no las incluya. Desde aquí no se puede distinguir, y no vamos a suponerlo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {totals.length > 0 || summariesFailed ? (
            <Card data-client-nutrition-summary>
              <CardHeader>
                <CardTitle role="heading" aria-level={2}>
                  Por día
                </CardTitle>
                {/* Why a day is missing, said once, rather than a zero drawn for it. */}
                <CardDescription>
                  Lo que suman sus comidas de cada día, contado solo con lo que su permiso te deja
                  ver. Un día sin comidas no aparece: puede ser uno que no registró o uno que
                  prefirió no mostrar, y desde aquí no se distingue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summariesFailed ? (
                  <Alert variant="danger" live="polite" data-client-nutrition-summary-failure>
                    <AlertTitle>No pudimos sumar sus días</AlertTitle>
                    <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
                    <AlertAction>
                      <Button size="sm" variant="outline" onClick={() => void summaries.refetch()}>
                        Reintentar
                      </Button>
                    </AlertAction>
                  </Alert>
                ) : (
                  <div data-client-nutrition-summary-list>
                    {totals.map((day) => (
                      <section key={day.day} data-client-nutrition-summary-day>
                        <h3 data-client-nutrition-summary-day-name>
                          {nutritionDayHeading(day.day)}
                        </h3>
                        <span data-client-nutrition-summary-meals>{day.meals}</span>
                        {day.totals.length > 0 ? (
                          <dl data-client-nutrition-totals>
                            {day.totals.map((total) => (
                              <Fragment key={total.name}>
                                <dt>{total.name}</dt>
                                <dd>{total.amount}</dd>
                              </Fragment>
                            ))}
                          </dl>
                        ) : null}
                      </section>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
          {days.length > 0 ? (
            <MealsCard
              days={days}
              version={first.applied_scope.version}
              timed={timed}
              more={<MoreControl query={meals} label="Ver más comidas" />}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function MealsCard({
  days,
  version,
  timed,
  more,
}: {
  days: readonly MealDay[]
  version: number
  timed: boolean
  more: ReactNode
}) {
  return (
    <Card data-client-nutrition-meals>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Comidas
        </CardTitle>
        <CardDescription>
          Versión {String(version)} del permiso de registro de comidas. Un dato que esa versión no
          incluye no aparece.
          {timed ? ' Las horas son las de su zona horaria.' : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div data-client-nutrition-day-list>
          {days.map((day) => (
            <section key={day.day} data-client-nutrition-day>
              <h3 data-client-nutrition-day-name>{nutritionDayHeading(day.day)}</h3>
              <ul data-client-nutrition-meal-list>
                {day.meals.map((meal) => (
                  <li key={meal.id}>
                    <MealEntry meal={meal} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {more}
      </CardContent>
    </Card>
  )
}

/**
 * The days asked for. Kept apart from the range applied, so a date being typed
 * reads nothing; pressing «Consultar» with the same days asks nothing again.
 */
function RangeForm({
  range,
  onApply,
}: {
  range: NutritionRange
  onApply: (next: NutritionRange) => void
}) {
  const [from, setFrom] = useState(range.from)
  const [to, setTo] = useState(range.to)
  const [problem, setProblem] = useState<RangeProblem | null>(null)
  const fromId = useId()
  const toId = useId()
  return (
    <form
      data-client-nutrition-range
      aria-label="Días que consultas"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const next = { from, to }
        const found = rangeProblem(next)
        setProblem(found)
        if (!found) onApply(next)
      }}
    >
      <div data-client-nutrition-range-dates>
        <Field data-invalid={problem !== null}>
          <FieldLabel htmlFor={fromId}>Desde</FieldLabel>
          <Input
            id={fromId}
            type="date"
            value={from}
            aria-invalid={problem !== null}
            onChange={(event) => {
              setFrom(event.target.value)
              setProblem(null)
            }}
          />
        </Field>
        <Field data-invalid={problem !== null}>
          <FieldLabel htmlFor={toId}>Hasta</FieldLabel>
          <Input
            id={toId}
            type="date"
            value={to}
            aria-invalid={problem !== null}
            onChange={(event) => {
              setTo(event.target.value)
              setProblem(null)
            }}
          />
        </Field>
      </div>
      {problem ? (
        <FieldError data-client-nutrition-range-error>{rangeProblemText(problem)}</FieldError>
      ) : null}
      <div data-client-nutrition-range-actions>
        <Button type="submit" size="sm" variant="outline">
          Consultar
        </Button>
        <span data-client-nutrition-range-note>
          Hasta {NUTRITION_RANGE_LIMIT} días, contados en los días de ella.
        </span>
      </div>
    </form>
  )
}

function MealEntry({ meal }: { meal: ClientNutritionMeal }) {
  const time = mealTimeLine(meal)
  const photo = mealPhoto(meal)
  const rows = mealItemRows(meal.items)
  return (
    <article data-client-nutrition-meal>
      <div data-client-nutrition-meal-head>
        <div data-client-nutrition-meal-identity>
          <strong data-client-nutrition-meal-title>{mealTitle(meal.meal_type)}</strong>
          {time ? <span data-client-nutrition-meal-time>{time}</span> : null}
        </div>
        {/* Null draws nothing: it means she shares no photos, not that there is none. */}
        {photo ? (
          <span data-client-nutrition-meal-photo={photo}>
            {photo === 'attached' ? 'Con foto' : 'Sin foto'}
          </span>
        ) : null}
      </div>
      {meal.note ? <p data-client-nutrition-meal-note>{meal.note}</p> : null}
      {rows.length > 0 ? (
        <ul data-client-nutrition-item-list>
          {rows.map((row) => (
            <li key={row.item.position} data-client-nutrition-item>
              {row.line ? <span data-client-nutrition-item-line>{row.line}</span> : null}
              {row.nutrients ? (
                <span data-client-nutrition-item-nutrients>{row.nutrients}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

/** The next page, only when asked: each page is a read recorded for her. */
function MoreControl({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    fetchNextPage: () => unknown
  }
  label: string
}) {
  if (query.isFetchNextPageError) {
    return (
      <Alert variant="danger" live="polite" data-client-nutrition-more-failure>
        <AlertTitle>No pudimos cargar más</AlertTitle>
        <AlertDescription>La conexión falló de forma temporal.</AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void query.fetchNextPage()}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (!query.hasNextPage) return null
  return (
    <div data-client-nutrition-more>
      <Button
        size="sm"
        variant="outline"
        disabled={query.isFetchingNextPage}
        onClick={() => void query.fetchNextPage()}
      >
        {query.isFetchingNextPage ? 'Cargando…' : label}
      </Button>
    </div>
  )
}

/**
 * Criterion 1: the meals permission, which neither training nor body progress
 * grants. No retry — pressing it again would refuse again, and each attempt is
 * recorded for her.
 */
function ScopeRequiredState({ cardPath }: { cardPath: string }) {
  return (
    <div data-client-nutrition-screen>
      <Alert variant="warning" live="polite" data-client-nutrition-scope-required>
        <AlertTitle>No te autorizó su registro de comidas</AlertTitle>
        <AlertDescription>
          Hace falta el permiso de registro de comidas vigente, que es aparte de los demás, y hoy no
          lo hay: no se muestra nada suyo, ni siquiera en blanco. El intento queda registrado y ella
          puede verlo. En su ficha está qué categorías sí te autorizó.
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

/**
 * Absent, not attended by this caller, or read by an owner or an admin: the
 * operation answers the same for all of them (criteria 4 and 7).
 */
function UnreachableState({ directoryPath }: { directoryPath: string }) {
  return (
    <div data-client-nutrition-screen>
      <Empty data-client-nutrition-unreachable>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="person" decorative />
          </EmptyMedia>
          <EmptyTitle>No encontramos este registro de comidas</EmptyTitle>
          <EmptyDescription>
            Solo lo abre quien atiende a la persona, ni siquiera el propietario o un administrador.
            Vuelve a clientes para elegir a alguien.
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
    <Alert variant="danger" live="polite" data-client-nutrition-failure>
      <AlertTitle>No pudimos cargar sus comidas</AlertTitle>
      <AlertDescription>
        La conexión falló de forma temporal. Lo que te autorizó sigue igual.
      </AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Reintentar
        </Button>
      </AlertAction>
    </Alert>
  )
}

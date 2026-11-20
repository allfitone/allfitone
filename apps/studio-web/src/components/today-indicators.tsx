'use client'

import { BarList } from '@allfitone/react/components/bar-list'
import { AreaChart, BarChart } from '@allfitone/react/components/chart'
import Link from 'next/link'
import type { ReactNode } from 'react'

import type {
  StudioToday,
  TodayProfessionalLoad,
  TodayRelationshipChanges,
  TodayTrainingAdherence,
} from '@/lib/studio-api'
import {
  adherenceHasSessions,
  adherenceWeekName,
  adherenceWeekValue,
  adherenceWeeks,
  hiddenCount,
  professionalLoadRows,
  relationshipMonthName,
  relationshipMonths,
  relationshipsChanged,
} from '@/lib/studio-today'

// Taller than the library default: beside a list of eight coaches, a plot of
// 224px left a third of its panel empty.
const PLOT_HEIGHT = 320

/**
 * How the organization is doing: the indicators `OP-REL-020` sends beside the
 * notices, one panel each.
 *
 * **Its own file because it is its own download.** The charts bring a plotting
 * library the rest of Studio never needs, so the workspace loads this module
 * only when an answer carries an indicator. A coach's phone does not pay for it
 * on the way to the list of her clients, and an answer with no indicators never
 * asks for it at all.
 *
 * **It draws what arrived and asks no role.** An indicator the caller's roles do
 * not open is absent from the answer, so it has no panel; nothing here decides
 * who sees what. The same rule the notices follow, for the same reason.
 *
 * **Ruled, never lifted.** These are states: nothing here waits on anybody, and
 * none of it makes the day non-empty. The raised cards stay with what does.
 *
 * Every panel says in words what it would have drawn when there is nothing to
 * draw. A chart of empty axes reads as a broken one.
 */
export default function TodayIndicators({
  indicators,
  organizationId,
}: {
  indicators: NonNullable<StudioToday['indicators']>
  organizationId: string
}) {
  const { training_adherence, relationship_changes, professional_load } = indicators

  return (
    <div data-today-indicators>
      {training_adherence ? <Adherence adherence={training_adherence} /> : null}
      {relationship_changes ? <RelationshipChanges changes={relationship_changes} /> : null}
      {professional_load ? (
        <ProfessionalLoad load={professional_load} organizationId={organizationId} />
      ) : null}
    </div>
  )
}

/**
 * What the caller's clients logged out of what was due, over eight closed
 * weeks. One line, because it is one question: more than before, or less.
 *
 * The scale is fixed at 0 to 100. Left to fit the data, a month between 82 and
 * 86 would draw the same cliff as one between 20 and 90.
 */
function Adherence({ adherence }: { adherence: TodayTrainingAdherence }) {
  const weeks = adherenceWeeks(adherence)

  return (
    <Indicator
      slot="adherence"
      title="Adherencia de tus clientes"
      note="Sesiones registradas de las planeadas, en las últimas ocho semanas cerradas."
    >
      {adherenceHasSessions(weeks) ? (
        <AreaChart
          aria-label="Adherencia de tus clientes, semana a semana"
          data={weeks}
          index="week"
          indexLabel="Semana"
          series={[{ key: 'rate', label: 'Adherencia' }]}
          domain={[0, 100]}
          formatValue={(value) => `${value} %`}
          describeValue={(_value, week) => adherenceWeekValue(week)}
          formatIndex={(_index, week) => adherenceWeekName(week)}
          missingLabel="Sin sesiones planeadas"
          height={PLOT_HEIGHT}
        />
      ) : (
        <Nothing>No hubo sesiones planeadas en estas ocho semanas.</Nothing>
      )}
    </Indicator>
  )
}

/** Relationships begun and ended in each of the last six months, side by side. */
function RelationshipChanges({ changes }: { changes: TodayRelationshipChanges }) {
  const months = relationshipMonths(changes)

  return (
    <Indicator
      slot="relationship-changes"
      title="Altas y bajas de clientes"
      note="Quién empezó y quién terminó, mes a mes."
    >
      {relationshipsChanged(months) ? (
        <BarChart
          aria-label="Altas y bajas de clientes, mes a mes"
          data={months}
          index="month"
          indexLabel="Mes"
          series={[
            { key: 'started', label: 'Altas' },
            { key: 'ended', label: 'Bajas' },
          ]}
          formatIndex={(_index, month) => relationshipMonthName(month)}
          height={PLOT_HEIGHT}
        />
      ) : (
        <Nothing>Sin altas ni bajas en los últimos seis meses.</Nothing>
      )}
    </Indicator>
  )
}

/**
 * The clients each professional holds today. A list and not a chart: the names
 * matter as much as the sizes, and the one with none is the answer to «who can
 * take the next one».
 *
 * The contract lists twelve at most and counts everyone, so the remainder is
 * said and leads to the team, which lists them all.
 */
function ProfessionalLoad({
  load,
  organizationId,
}: {
  load: TodayProfessionalLoad
  organizationId: string
}) {
  const rows = professionalLoadRows(load)
  const hidden = hiddenCount(load)

  return (
    <Indicator
      slot="professional-load"
      title="Clientes por profesional"
      note="Los que cada coach tiene a su cargo hoy."
    >
      {rows.length > 0 ? (
        <>
          <BarList aria-label="Clientes por profesional" items={rows} />
          {hidden > 0 ? (
            <Link href={`/organizations/${organizationId}/team`} data-today-indicator-more>
              y {hidden} más
            </Link>
          ) : null}
        </>
      ) : (
        <Nothing>Ningún integrante tiene el rol de coach.</Nothing>
      )}
    </Indicator>
  )
}

/** One panel: what it measures, in a title and a sentence, over the drawing. */
function Indicator({
  slot,
  title,
  note,
  children,
}: {
  slot: string
  title: string
  note: string
  children: ReactNode
}) {
  const heading = `today-indicator-${slot}`

  return (
    <section data-today-indicator={slot} aria-labelledby={heading}>
      <div data-today-indicator-head>
        <h2 id={heading} data-today-state-title>
          {title}
        </h2>
        <p data-today-indicator-note>{note}</p>
      </div>
      {children}
    </section>
  )
}

/** Said in place of a drawing that would have had nothing in it. */
function Nothing({ children }: { children: string }) {
  return <p data-today-indicator-nothing>{children}</p>
}

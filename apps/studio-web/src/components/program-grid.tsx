'use client'

/**
 * A program's sessions as a calendar: a row for every week, seven days across.
 *
 * The week is read as a week, which a list of sessions with a «Semana» and a
 * «Día» select each never let it be. An empty day adds a session where it is
 * pressed; a session opens what can be done with it, or is dragged to another
 * day. On a phone the seven columns have no room, so a week becomes the list
 * of its sessions with one button that adds to it.
 *
 * Day 1 is the first day of the program for whoever receives it and not a
 * weekday, so the columns are numbered and never named.
 *
 * An added week that still holds nothing exists on this screen only: the draft
 * stores sessions, and it is gone the next time the draft is opened.
 */

import { Button } from '@allfitone/react/components/button'
import { FoundationIcon } from '@allfitone/react/icons'
import { useState } from 'react'

import { AddSession, ProgramSession } from './program-session'
import {
  DAY_OPTIONS,
  WEEK_LIMIT,
  nextDayInWeek,
  programGrid,
  weekChoices,
  weekCount,
  type ComposableTemplate,
  type ProgramEditorSession,
  type TemplateVersionChoice,
} from '@/lib/program-editor'

export function ProgramGrid({
  sessions,
  index,
  templates,
  hiddenTemplates,
  contentPath,
  onAdd,
  onMove,
  onRemove,
}: {
  sessions: readonly ProgramEditorSession[]
  index: ReadonlyMap<string, TemplateVersionChoice>
  templates: readonly ComposableTemplate[]
  hiddenTemplates: number
  contentPath: string
  onAdd: (session: { week: number; day: number; templateVersionId: string }) => void
  onMove: (key: string, to: { week?: number; day?: number }) => void
  onRemove: (key: string) => void
}) {
  const [shown, setShown] = useState(1)
  // One panel at a time, named by what it belongs to, so it follows a session that moves.
  const [panel, setPanel] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [remembered, setRemembered] = useState<string | null>(null)

  const weeks = weekCount(sessions, shown)
  // A week stays on screen once shown: moving its last session away must not take the row.
  if (weeks > shown) setShown(weeks)
  const choices = weekChoices(weeks)

  function panelProps(name: string) {
    return {
      open: panel === name,
      onOpenChange: (open: boolean) => setPanel(open ? name : null),
    }
  }

  function add(session: { week: number; day: number; templateVersionId: string }) {
    setRemembered(index.get(session.templateVersionId)?.templateId ?? null)
    setPanel(null)
    onAdd(session)
  }

  function drop(week: number, day: number) {
    const moved = sessions.find((session) => session.key === dragging)
    if (moved && (moved.week !== week || moved.day !== day)) onMove(moved.key, { week, day })
    setDragging(null)
    setTarget(null)
  }

  return (
    <div data-program-grid>
      {/* Read by eye across the columns; each day says its own name to a screen reader. */}
      <div data-program-grid-head aria-hidden="true">
        <span />
        {DAY_OPTIONS.map((day) => (
          <span key={day}>Día {day}</span>
        ))}
      </div>

      <ol data-program-grid-weeks aria-label="Semanas">
        {programGrid(sessions, weeks).map(({ week, days }) => (
          <li key={week} data-program-grid-week>
            <div data-program-week-head>
              <p role="heading" aria-level={2} data-program-week-name>
                Semana {week}
              </p>
              <AddSession
                templates={templates}
                hiddenTemplates={hiddenTemplates}
                week={week}
                suggestedDay={nextDayInWeek(sessions, week)}
                remembered={remembered}
                onAdd={add}
                {...panelProps(`week:${week}`)}
              />
            </div>
            <ol data-program-days aria-label={`Días de la semana ${week}`}>
              {days.map(({ day, sessions: onDay }) => {
                const cell = `${week}:${day}`
                return (
                  <li
                    key={day}
                    data-program-day
                    data-empty={onDay.length === 0}
                    data-drop-target={target === cell}
                    onDragOver={(event) => {
                      if (!dragging) return
                      event.preventDefault()
                      if (target !== cell) setTarget(cell)
                    }}
                    onDragLeave={(event) => {
                      // Passing over what the cell holds is not leaving it.
                      const to = event.relatedTarget
                      if (to instanceof Node && event.currentTarget.contains(to)) return
                      setTarget((previous) => (previous === cell ? null : previous))
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      drop(week, day)
                    }}
                  >
                    <span data-program-day-name>Día {day}</span>
                    {onDay.map((session) => (
                      <ProgramSession
                        key={session.key}
                        session={session}
                        version={index.get(session.templateVersionId)}
                        weeks={choices}
                        contentPath={contentPath}
                        dragging={dragging === session.key}
                        onDragStart={() => {
                          setPanel(null)
                          setDragging(session.key)
                        }}
                        onDragEnd={() => {
                          setDragging(null)
                          setTarget(null)
                        }}
                        onMove={(to) => onMove(session.key, to)}
                        onRemove={() => {
                          setPanel(null)
                          onRemove(session.key)
                        }}
                        {...panelProps(`session:${session.key}`)}
                      />
                    ))}
                    <AddSession
                      templates={templates}
                      hiddenTemplates={hiddenTemplates}
                      week={week}
                      day={day}
                      suggestedDay={day}
                      remembered={remembered}
                      onAdd={add}
                      {...panelProps(`day:${cell}`)}
                    />
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>

      <div data-editor-add>
        <Button
          type="button"
          variant="outline"
          disabled={weeks >= WEEK_LIMIT}
          onClick={() => setShown(weeks + 1)}
        >
          <FoundationIcon name="add" decorative />
          Agregar semana
        </Button>
      </div>
    </div>
  )
}

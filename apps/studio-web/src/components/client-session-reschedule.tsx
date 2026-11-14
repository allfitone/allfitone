'use client'

/**
 * Moving a managed session to another day of its own week: `HU-STUDIO-048`.
 *
 * **The day is the control.** The session's day in the calendar is what
 * changes, so that is what opens this — no fourth column, which would widen a
 * register the layout sweep measures at eight widths. A session that cannot
 * move keeps its day as plain text.
 *
 * The rules and their wording are in `@/lib/client-session-reschedule`.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@allfitone/react/components/alert-dialog'
import { Button } from '@allfitone/react/components/button'
import { Spinner } from '@allfitone/react/components/spinner'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { formatCalendarDay } from '@/lib/calendar-day'
import type { AssignPermission } from '@/lib/client-program-assignment'
import {
  rescheduleBoundsNote,
  rescheduleIsOffered,
  rescheduleTitle,
  rescheduleWeek,
  rescheduleWriteFailure,
} from '@/lib/client-session-reschedule'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type RelationshipAssignment,
  type RelationshipAssignmentSession,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

/** The weekday and the day of the month, which is all a week of seven needs. */
const DAY_FORMATTER = new Intl.DateTimeFormat('es-CO', {
  weekday: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function ClientSessionReschedule({
  session,
  assignment,
  organizationId,
  relationshipId,
  permission,
}: {
  session: RelationshipAssignmentSession
  assignment: RelationshipAssignment
  organizationId: string
  relationshipId: string
  permission: AssignPermission
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const [moved, setMoved] = useState<RelationshipAssignmentSession>()

  const reschedule = useStudioSessionMutation({
    mutationFn: ({ day, command }: { day: string; command: CommandHeaders }, signal) =>
      studioApi.reschedulePlannedSession(
        organizationId,
        session.id,
        { scheduled_on: day, expected_revision: session.revision_number },
        command,
        signal,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.relationshipAssignmentsRoot(organizationId, relationshipId),
      })
    },
  })

  const day = formatCalendarDay(session.scheduled_on)
  /*
   * Plain text when it cannot move, and the caller keeps its own lead element
   * around it — the same shape the executions list uses for the row that opens.
   */
  if (!rescheduleIsOffered(session, assignment, permission)) return <>{day}</>

  const week = rescheduleWeek(session, assignment)
  /*
   * The day it is on starts selected, so the picker says where the session
   * stands without a word for it — and choosing elsewhere moves the mark. It
   * stays selectable even when it is already past: picking it is the no-op the
   * contract allows, and `unchanged` is what keeps that from being sent.
   */
  const selected = chosen ?? session.scheduled_on
  const unchanged = selected === session.scheduled_on

  async function confirm(): Promise<void> {
    if (unchanged) return
    setFailure(undefined)
    /*
     * One intent per session and per day, so a retry of the same move reuses
     * the headers and a change of mind mints new ones.
     */
    const command = intents.commandFor({
      operation: 'reschedule-planned-session',
      resourceId: session.id,
      payload: { scheduled_on: selected, expected_revision: session.revision_number },
    })
    try {
      await reschedule.mutateAsync({ day: selected, command })
      intents.reset()
      setOpen(false)
      setChosen(undefined)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      const refusal = caught instanceof StudioApiError ? caught : undefined
      setFailure(rescheduleWriteFailure(refusal?.status ?? 0, refusal?.code))
      // The stale answer hands back the session as it stands, so it is shown
      // rather than dropped: neither version is lost.
      if (refusal?.code === 'stale-draft') setMoved(asSession(refusal.currentState))
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (reschedule.isPending) return
        setOpen(next)
        if (!next) {
          setFailure(undefined)
          setChosen(undefined)
          setMoved(undefined)
        }
      }}
    >
      {/* The Design System's own control, not a native button: a visible
          native one is a boundary error here. `link` is the variant for a
          control that reads inside a line of text, and the stylesheet takes it
          down to the row's own ink. */}
      <Button
        variant="link"
        data-client-session-move
        onClick={() => {
          setOpen(true)
        }}
      >
        {day}
      </Button>

      <AlertDialogContent data-client-session-move-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>{rescheduleTitle(session)}</AlertDialogTitle>
          <AlertDialogDescription>{rescheduleBoundsNote()}</AlertDialogDescription>
        </AlertDialogHeader>

        <ToggleGroup
          value={[selected]}
          onValueChange={(days: string[]) => {
            const next = days[0]
            if (next) setChosen(next)
          }}
          data-client-session-move-week
          aria-label="Día de la semana al que mover la sesión"
        >
          {week.map((entry) => (
            <ToggleGroupItem
              key={entry.day}
              value={entry.day}
              disabled={entry.state === 'closed'}
              data-state-kind={entry.state}
            >
              {DAY_FORMATTER.format(new Date(`${entry.day}T00:00:00Z`))}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {failure ? (
          <Alert variant="danger" live="assertive" data-client-session-move-error>
            <AlertTitle>No se movió</AlertTitle>
            <AlertDescription>
              {failure}
              {moved ? <span> Está en el {formatCalendarDay(moved.scheduled_on)}.</span> : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={reschedule.isPending}>Dejarla en su día</AlertDialogCancel>
          <Button
            type="button"
            disabled={reschedule.isPending || unchanged}
            onClick={() => {
              void confirm()
            }}
          >
            {reschedule.isPending ? <Spinner label="Moviendo la sesión" /> : null}
            {reschedule.isPending ? 'Moviendo…' : 'Mover a ese día'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The session a `stale-draft` hands back, when it is one.
 *
 * `current_state` is typed `unknown` because a problem document may carry
 * anything; a shape that is not a session is treated as absent rather than
 * rendered half-read.
 */
function asSession(value: unknown): RelationshipAssignmentSession | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (!('scheduled_on' in value) || typeof value.scheduled_on !== 'string') return undefined
  return value as RelationshipAssignmentSession
}

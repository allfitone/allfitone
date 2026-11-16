'use client'

/**
 * Stopping a program the organization manages, from the card of that program:
 * `HU-STUDIO-050`.
 *
 * The dialog says both halves before the click, and **the card stays after
 * it** — with its status now `cancelled` — because the third criterion is that
 * the assignment does not leave her history. A card that vanished would show
 * the opposite of what happened.
 *
 * The rules and their wording are in `@/lib/client-program-cancellation`.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
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
import { Button } from '@allfitone/react/components/button'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import type { AssignPermission } from '@/lib/client-program-assignment'
import {
  canCancelAssignment,
  cancelConsequences,
  cancelOutcome,
  cancelTitle,
  cancelWriteFailure,
} from '@/lib/client-program-cancellation'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type RelationshipAssignment,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function ClientProgramCancellation({
  assignment,
  organizationId,
  relationshipId,
  permission,
}: {
  assignment: RelationshipAssignment
  organizationId: string
  relationshipId: string
  permission: AssignPermission
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState('')

  const cancel = useStudioSessionMutation({
    mutationFn: ({ command }: { command: CommandHeaders }, signal) =>
      studioApi.cancelProgramAssignment(organizationId, assignment.id, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.relationshipAssignmentsRoot(organizationId, relationshipId),
      })
    },
  })

  /*
   * The action goes away the moment it succeeds — a cancelled program is not
   * cancellable — so the outcome has to outlive it. Nothing is rendered only
   * when there is neither an action to offer nor a result to announce; after a
   * cancellation the sentence stays where the button was, which is where the
   * reader is looking.
   */
  const offered = canCancelAssignment(assignment, permission)
  if (!offered && !outcome) return null

  async function confirm() {
    setFailure(undefined)
    /*
     * One intent per assignment, so a retry after a failed answer reuses the
     * same headers. The command carries no payload: the assignment in the path
     * is the whole request, and cancelling again answers the same cancellation.
     */
    const command = intents.commandFor({
      operation: 'cancel-program-assignment',
      resourceId: assignment.id,
      payload: null,
    })
    try {
      const cancellation = await cancel.mutateAsync({ command })
      intents.reset()
      setOpen(false)
      setOutcome(cancelOutcome(cancellation))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      /*
       * The code and not only the status: the 409 has two causes with opposite
       * advice, and the answer says which.
       */
      const refusal = caught instanceof StudioApiError ? caught : undefined
      setFailure(cancelWriteFailure(refusal?.status ?? 0, refusal?.code))
    }
  }

  return (
    <div data-client-program-cancel>
      {offered ? (
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            // Closing mid-flight would hide a request that is still going to land.
            if (cancel.isPending) return
            setOpen(next)
            if (!next) setFailure(undefined)
          }}
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOutcome('')
              setOpen(true)
            }}
          >
            Cancelar este programa
          </Button>

          <AlertDialogContent data-client-program-cancel-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>{cancelTitle(assignment)}</AlertDialogTitle>
              <AlertDialogDescription>
                <b>No se puede deshacer:</b> un programa cancelado no se reanuda. Para volver a
                trabajarlo hay que asignarlo de nuevo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Criteria 1 and 2, both halves, before the click. */}
            {cancelConsequences().map((line) => (
              <p key={line}>{line}</p>
            ))}

            {failure ? (
              <Alert variant="danger" live="assertive" data-client-program-cancel-error>
                <AlertTitle>No se canceló</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancel.isPending}>Dejarlo activo</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={cancel.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  void confirm()
                }}
              >
                {cancel.isPending ? <Spinner label="Cancelando el programa" /> : null}
                {cancel.isPending ? 'Cancelando…' : 'Cancelar ahora'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      <p role="status" aria-live="polite" data-client-program-cancel-outcome>
        {outcome}
      </p>
    </div>
  )
}

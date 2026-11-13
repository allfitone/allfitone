'use client'

/**
 * Closing a case from its row: `HU-STUDIO-063`.
 *
 * The dialog says the three criteria before the click: closing deletes no record
 * of access, a closed case never reopens, and the case would stop serving on its
 * own anyway. The row becomes a closed case once the list is read again, so the
 * outcome is handed up to the register, which outlives the row. The rules and
 * their wording are in `@/lib/historical-close`.
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
import { Button } from '@allfitone/react/components/button'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import { closeConsequences, closeFailure, closeOutcome, closeTitle } from '@/lib/historical-close'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type HistoricalAccessCase,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function HistoricalCaseClose({
  entry,
  onClosed,
}: {
  entry: HistoricalAccessCase
  onClosed: (outcome: string) => void
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()

  const close = useStudioSessionMutation({
    mutationFn: ({ command }: { command: CommandHeaders }, signal) =>
      studioApi.closeHistoricalAccessCase(entry.organization_id, entry.id, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.historicalAccessCasesRoot(entry.organization_id),
      })
    },
  })

  async function confirm() {
    setFailure(undefined)
    const command = intents.commandFor({
      operation: 'close-historical-access-case',
      resourceId: entry.id,
      payload: null,
    })
    try {
      const after = await close.mutateAsync({ command })
      intents.reset()
      setOpen(false)
      onClosed(closeOutcome(after))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setFailure(closeFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (close.isPending) return
        setOpen(next)
        if (!next) setFailure(undefined)
      }}
    >
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Cerrar el caso
      </Button>

      <AlertDialogContent data-historical-case-close-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>{closeTitle(entry)}</AlertDialogTitle>
          <AlertDialogDescription>Desde ese momento no deja consultar nada.</AlertDialogDescription>
        </AlertDialogHeader>
        {closeConsequences(entry).map((line) => (
          <p key={line}>{line}</p>
        ))}

        {failure ? (
          <Alert variant="danger" live="assertive" data-historical-case-close-error>
            <AlertTitle>No se cerró</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={close.isPending}>Mantenerlo abierto</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={close.isPending}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {close.isPending ? <Spinner label="Cerrando el caso" /> : null}
            {close.isPending ? 'Cerrando…' : 'Cerrar ahora'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

'use client'

/**
 * Archiving a gym's own movement: `HU-STUDIO-066`.
 *
 * Owners and admins only: `archive_movements` is theirs and not a coach's, so
 * a coach is told who can rather than offered a button that answers `403`.
 * The three criteria are the server's, and the card says them before the
 * click, because archiving has no way back:
 *
 * 1. **It leaves the search for new content, and is not deleted.** The search
 *    leaves archived movements out unless asked; the template editor's picker
 *    never asks.
 * 2. **Published versions and sessions keep resolving it.** They name the
 *    movement by id, and its read answers archived movements too.
 * 3. **A movement history references is never deleted.** There is no delete
 *    command at all.
 *
 * `AlertDialog`, like the other commands that cannot be undone from Studio.
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { movementArchiveFailure } from '@/lib/movement-form'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type OrganizationMovement,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function MovementArchive({
  movement,
  organizationId,
}: {
  movement: OrganizationMovement
  organizationId: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [command, setCommand] = useState(newCommand)
  const [failure, setFailure] = useState<string>()

  const archive = useStudioSessionMutation({
    mutationFn: ({ command }: { command: CommandHeaders }, signal) =>
      studioApi.archiveOrganizationMovement(organizationId, movement.id, command, signal),
    onSuccess: (archived) => {
      // The page reads the archived movement and stops offering the edit.
      queryClient.setQueryData(
        studioQueryKeys.organizationMovement(organizationId, archived.id),
        archived,
      )
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationMovementsRoot(organizationId),
      })
    },
  })

  async function confirm() {
    setFailure(undefined)
    try {
      await archive.mutateAsync({ command })
      setOpen(false)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setFailure(movementArchiveFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <Card data-movement-archive>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Archivar el movimiento
        </CardTitle>
        <CardDescription>
          Deja de aparecer al buscar movimientos para contenido nuevo, pero no se borra: las
          versiones publicadas y las sesiones que lo usan siguen mostrando su nombre. No se puede
          deshacer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            // Closing mid-flight would hide a request that is still going to land.
            if (archive.isPending) return
            setOpen(next)
            if (!next) setFailure(undefined)
          }}
        >
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Archivar
          </Button>

          <AlertDialogContent data-movement-archive-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Archivar «{movement.name}»?</AlertDialogTitle>
              <AlertDialogDescription>
                <b>No se puede deshacer.</b> Nadie podrá sumarlo a una plantilla nueva.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <p>
              Lo que ya existe no cambia: las versiones publicadas y las sesiones que lo usan lo
              conservan con su nombre, y el movimiento no se borra.
            </p>

            {failure ? (
              <Alert variant="danger" live="assertive" data-movement-archive-error>
                <AlertTitle>No se archivó</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={archive.isPending}>Mantenerlo</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={archive.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  void confirm()
                }}
              >
                {archive.isPending ? <Spinner label="Archivando" /> : null}
                {archive.isPending ? 'Archivando…' : 'Archivar ahora'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

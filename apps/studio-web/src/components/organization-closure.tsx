'use client'

/**
 * Closing the organization. The heaviest thing this product lets anybody do,
 * and the only one that ends the reader's own access as part of succeeding.
 *
 * `AlertDialog`, like the other closures, and for a stronger reason: this one
 * cannot be undone from anywhere. Reopening is not an operation.
 *
 * The dialog's four paragraphs are the four promises, in the order somebody
 * worries about them — what happens, what does not, what is kept, and that
 * there is no half-closure — plus the one sentence that is not a promise but a
 * warning: **nobody tells the clients**. The closure enqueues that notice and
 * `relationship.terminated.v1` has no worker, which the delivery-coverage test
 * names as open, so the honest thing is to tell the owner to do it themselves.
 *
 * Two things set its shape apart from the sibling dialogs:
 *
 * - **It is blocked before it is offered.** A subscription that is not `ended`
 *   refuses the closure in PostgreSQL, so the button stays visible with the
 *   reason beside it rather than disappearing — a control that vanishes without
 *   explanation leaves an owner hunting for why they cannot close.
 * - **Success takes the reader out.** Every membership closes, including
 *   theirs, so there is no workspace to return to. It navigates to `/app`,
 *   which is the entry that decides what somebody with no active membership
 *   sees.
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
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  ALL_OR_NOTHING,
  CLIENTS_ARE_NOT_TOLD,
  WHAT_CLOSING_DOES,
  WHAT_CLOSING_DOES_NOT_DO,
  WHAT_IS_KEPT,
  closureRefusalDescription,
  closureRefusalFor,
  closureRefusalTitle,
  closedSummary,
  type ClosureRefusal,
} from '@/lib/organization-closure'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type OrganizationClosure as OrganizationClosureResult,
} from '@/lib/studio-api'

export function OrganizationClosure({
  organizationId,
  organizationName,
  blockedReason,
}: {
  organizationId: string
  organizationName: string
  /** Null when nothing stands in the way; the sentence to show when something does. */
  blockedReason: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [refusal, setRefusal] = useState<ClosureRefusal | null>(null)

  const [closed, setClosed] = useState<OrganizationClosureResult>()

  const close = useMutation({
    mutationFn: () => studioApi.closeOrganization(organizationId, newCommand()),
    onSuccess: (result) => {
      /*
       * A receipt before leaving, not a silent redirect. The response is the
       * only place the count of ended relationships exists, and this is the
       * heaviest action in the product: an owner who closed a gym should read
       * what it did rather than find themselves somewhere else.
       *
       * Leaving is then explicit, because their own membership is closed and
       * this workspace is no longer theirs.
       */
      setRefusal(null)
      setClosed(result)
    },
    onError: (error) => {
      setRefusal(closureRefusalFor(error instanceof StudioApiError ? error.status : undefined))
    },
  })

  /** `replace`, so a closed organization stays out of the back button. */
  function leave(): void {
    router.replace('/app')
  }

  return (
    <section data-organization-closure aria-labelledby="organization-closure-title">
      <h2 data-organization-closure-title id="organization-closure-title">
        Cerrar la organización
      </h2>
      {/* Enough to decide whether to open the dialog, not enough to decide. */}
      <p data-organization-closure-lead>
        Termina la operación de forma ordenada: cierra todas las relaciones, las membresías y las
        invitaciones pendientes. No se puede deshacer, y reabrir no existe.
      </p>

      {blockedReason ? (
        <Alert variant="warning" data-organization-closure-blocked>
          <AlertTitle>No puedes cerrarla todavía</AlertTitle>
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      ) : null}

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          // Closing mid-flight would hide a request that is still going to
          // land, and this one cannot be undone from anywhere.
          if (close.isPending) return
          setOpen(next)
          if (!next) setRefusal(null)
        }}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-organization-close
          disabled={Boolean(blockedReason)}
          onClick={() => setOpen(true)}
        >
          Cerrar la organización
        </Button>

        {closed ? (
          <AlertDialogContent data-organization-closed-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>{organizationName} quedó cerrada</AlertDialogTitle>
              <AlertDialogDescription>
                {closedSummary(closed.relationships_terminated)}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <p data-organization-closed-kept>{WHAT_CLOSING_DOES_NOT_DO}</p>
            {/* Said again here on purpose: it is the one thing still pending
                on the owner, and they are about to leave this screen. */}
            <Alert variant="warning" data-organization-closed-notice>
              <AlertTitle>Queda avisarles</AlertTitle>
              <AlertDescription>{CLIENTS_ARE_NOT_TOLD}</AlertDescription>
            </Alert>

            <AlertDialogFooter>
              <AlertDialogAction onClick={leave}>Salir de la organización</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : (
          <AlertDialogContent data-organization-closure-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Cerrar {organizationName}?</AlertDialogTitle>
              <AlertDialogDescription>
                <b>No se puede deshacer</b>, y reabrir una organización cerrada no es una operación.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <p data-organization-closure-effect>{WHAT_CLOSING_DOES}</p>
            <p data-organization-closure-kept>{WHAT_CLOSING_DOES_NOT_DO}</p>
            <p data-organization-closure-evidence>{WHAT_IS_KEPT}</p>
            <p data-organization-closure-atomic>{ALL_OR_NOTHING}</p>

            {/* Not a promise but a warning, and the only instruction here. */}
            <Alert variant="warning" data-organization-closure-notice>
              <AlertTitle>Avísales tú</AlertTitle>
              <AlertDescription>{CLIENTS_ARE_NOT_TOLD}</AlertDescription>
            </Alert>

            {refusal ? (
              <Alert variant="danger" live="assertive" data-organization-closure-error>
                <AlertTitle>{closureRefusalTitle(refusal)}</AlertTitle>
                <AlertDescription>{closureRefusalDescription(refusal)}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              {/* Names what stays, like the sibling dialogs. */}
              <AlertDialogCancel disabled={close.isPending}>Mantenerla abierta</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={close.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  close.mutate()
                }}
              >
                {close.isPending ? <Spinner label="Cerrando la organización" /> : null}
                {close.isPending ? 'Cerrando…' : 'Cerrar ahora'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  )
}

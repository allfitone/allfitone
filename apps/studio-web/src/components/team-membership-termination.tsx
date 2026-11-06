'use client'

/**
 * Ending somebody's membership in the organization.
 *
 * The dialog's whole job is one sentence, and it is the opposite of what the
 * reader fears. Somebody giving a coach de baja assumes one of two wrong
 * things: that the clients leave with them, or that nothing else happens. What
 * happens is that **the clients stay and lose their professional** — the
 * relationships are untouched, the permissions they granted are untouched, and
 * there is nobody attending them until an administrator reassigns each one.
 *
 * A gym that ends its only coach and is not told this keeps clients nobody
 * attends, and finds out when one of them asks.
 *
 * `AlertDialog`, like ending a relationship: closing a membership cannot be
 * undone from here. Re-hiring the person is a new invitation and a new
 * membership, and it does not restore a single assignment.
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
import { Spinner } from '@allfitone/react/components/spinner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  terminationRefusalDescription,
  terminationRefusalFor,
  terminationRefusalTitle,
  whatTerminationLeavesSentence,
  type TerminationRefusal,
} from '@/lib/team-membership-termination'
import { StudioApiError, newCommand, studioApi } from '@/lib/studio-api'
import type { OrganizationMembership } from '@/lib/studio-api'
import { studioQueryKeys } from '@/lib/studio-query'

export function TeamMembershipTermination({
  organizationId,
  membership,
  open,
  onOpenChange,
}: {
  organizationId: string
  membership: OrganizationMembership
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [refusal, setRefusal] = useState<TerminationRefusal | null>(null)

  const terminate = useMutation({
    mutationFn: () =>
      studioApi.terminateMembership(organizationId, membership.membership_id, newCommand()),
    onSuccess: async () => {
      setRefusal(null)
      // Re-read before closing, the same rule the role commands follow: what
      // the next reader acts on came from the server after the change.
      await queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationMembershipsRoot(organizationId),
      })
      onOpenChange(false)
    },
    onError: (error) => {
      setRefusal(terminationRefusalFor(error instanceof StudioApiError ? error.status : undefined))
    },
  })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land,
        // and this one cannot be undone from here.
        if (terminate.isPending) return
        onOpenChange(next)
        if (!next) setRefusal(null)
      }}
    >
      <AlertDialogContent data-team-membership-termination-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Dar de baja a {membership.display_name}?</AlertDialogTitle>
          <AlertDialogDescription>
            <b>Pierde el acceso a Studio en el acto</b>, con sus roles y sus asignaciones.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* The sentence this dialog exists for, and the reason it is computed:
            only a coach leaves clients without anybody attending them. */}
        <p data-team-membership-termination-consequence>
          {whatTerminationLeavesSentence(membership)}
        </p>

        {/* Criterion 3, and the half that reassures rather than warns. Said
            second because it is what somebody worries about after reading the
            first, not before. */}
        <p data-team-membership-termination-kept>
          Lo que escribió se conserva, con su nombre. Dar de baja cierra su participación, no borra
          su trabajo.
        </p>

        {refusal ? (
          <Alert variant="danger" live="assertive" data-team-membership-termination-error>
            <AlertTitle>{terminationRefusalTitle(refusal)}</AlertTitle>
            <AlertDescription>{terminationRefusalDescription(refusal)}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          {/* Names what stays, like the sibling dialogs, rather than an action
              the reader has to interpret. */}
          <AlertDialogCancel disabled={terminate.isPending}>
            Mantener la membresía
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={terminate.isPending}
            onClick={(event) => {
              event.preventDefault()
              terminate.mutate()
            }}
          >
            {terminate.isPending ? <Spinner label="Dando de baja" /> : null}
            {terminate.isPending ? 'Dando de baja…' : 'Dar de baja ahora'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

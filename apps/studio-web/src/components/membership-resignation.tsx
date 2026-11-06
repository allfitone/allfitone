'use client'

/**
 * Leaving an organization yourself.
 *
 * It lives on your own card, in your own profile, and not in the team
 * directory: `organizations.resign_membership` resolves the membership from the
 * person in the session, and the administrator's command refuses
 * `target.person_id = actor` outright. Nobody resigns on anybody else's behalf.
 *
 * The dialog's job is the half the reader cannot see. They know they are
 * leaving; what they do not know is that **their clients stay with the gym and
 * lose their professional** — the relationships are untouched and there is
 * nobody attending those people until an administrator reassigns each one.
 *
 * Unlike the two termination dialogs, this one may promise the notice:
 * `organization.membership_resigned.v1` has a worker that claims it, with no
 * flag in front of it, so an email does leave for every owner and admin with a
 * contact email.
 *
 * `AlertDialog`, like both terminations: this cannot be undone from here.
 * Coming back is a new invitation and a new membership, and it restores no
 * assignment.
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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  resignationRefusalDescription,
  resignationRefusalFor,
  resignationRefusalTitle,
  whatResigningLeavesSentence,
  type ResignationRefusal,
} from '@/lib/membership-resignation'
import { StudioApiError, newCommand, studioApi } from '@/lib/studio-api'
import type { Membership } from '@/lib/studio-api'
import { studioQueryKeys } from '@/lib/studio-query'

export function MembershipResignation({ membership }: { membership: Membership }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [refusal, setRefusal] = useState<ResignationRefusal | null>(null)

  const resign = useMutation({
    mutationFn: () => studioApi.resignMembership(membership.organization_id, newCommand()),
    onSuccess: async () => {
      setRefusal(null)
      // Re-read before closing, the same rule the sibling commands follow: the
      // card has to come back from the server as finished, not be hidden here.
      await queryClient.invalidateQueries({ queryKey: studioQueryKeys.me(), exact: true })
      setOpen(false)
    },
    onError: (error) => {
      setRefusal(resignationRefusalFor(error instanceof StudioApiError ? error.status : undefined))
    },
  })

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land,
        // and this one cannot be undone from here.
        if (resign.isPending) return
        setOpen(next)
        if (!next) setRefusal(null)
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-membership-resign
        onClick={() => setOpen(true)}
      >
        Renunciar a la vinculación
      </Button>

      <AlertDialogContent data-membership-resignation-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Renunciar a tu vinculación con {membership.display_name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <b>Pierdes el acceso en el acto</b>, con tus roles y tus asignaciones.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* The sentence this dialog exists for, and the reason it is computed:
            only a coach leaves clients without anybody attending them. */}
        <p data-membership-resignation-consequence>{whatResigningLeavesSentence(membership)}</p>

        {/* The two halves that reassure. Said second because they are what
            somebody worries about after reading the first, not before. */}
        <p data-membership-resignation-kept>
          Se avisa a la administración del gimnasio. Lo que registraste se conserva, con tu nombre:
          renunciar cierra tu participación, no borra tu trabajo.
        </p>

        {refusal ? (
          <Alert variant="danger" live="assertive" data-membership-resignation-error>
            <AlertTitle>{resignationRefusalTitle(refusal)}</AlertTitle>
            <AlertDescription>{resignationRefusalDescription(refusal)}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          {/* Names what stays, like the sibling dialogs, rather than an action
              the reader has to interpret. */}
          <AlertDialogCancel disabled={resign.isPending}>Seguir vinculado</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={resign.isPending}
            onClick={(event) => {
              event.preventDefault()
              resign.mutate()
            }}
          >
            {resign.isPending ? <Spinner label="Renunciando" /> : null}
            {resign.isPending ? 'Renunciando…' : 'Renunciar ahora'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

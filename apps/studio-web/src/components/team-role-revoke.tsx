'use client'

/**
 * Taking a role back from somebody on the team.
 *
 * An `AlertDialog` and not the grant's plain `Dialog`, for one reason: giving a
 * role back does not undo this. Revoking `coach` closes that person's
 * professional assignments — the rows are set to `ended`, not hidden — so the
 * clients they were attending have to be assigned to somebody again by hand.
 * The grant is a step you can walk back; this one is not.
 *
 * The sentence under the picker is the point of the screen, and it **changes
 * with the role chosen**. Revoking `coach` ends the assignments; revoking
 * `admin` or `staff` does not, so long as `coach` is still held. Those are
 * criteria 2 and 3 of the story, and the database turns on exactly the same
 * condition. A single sentence for every role would be false for three of the
 * four readers.
 *
 * Owner is not here, and cannot be: the contract's path parameter only spells
 * admin, coach and staff. Ownership moves through a transfer.
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
import { Field, FieldDescription, FieldLabel } from '@allfitone/react/components/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { Spinner } from '@allfitone/react/components/spinner'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { organizationRoleLabel } from '@/lib/team-directory'
import {
  revocableRoles,
  roleRevokeRefusalDescription,
  roleRevokeRefusalFor,
  roleRevokeRefusalTitle,
  whatRevokingStopsSentence,
  type AssignableRole,
  type RoleRevokeRefusal,
} from '@/lib/team-roles'
import { StudioApiError, newCommand, studioApi } from '@/lib/studio-api'
import type { OrganizationMembership, OrganizationRoleCode } from '@/lib/studio-api'
import { studioQueryKeys } from '@/lib/studio-query'

export function TeamRoleRevoke({
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
  const fieldId = useId()
  const queryClient = useQueryClient()
  const [role, setRole] = useState('')
  const [refusal, setRefusal] = useState<RoleRevokeRefusal | null>(null)

  const revoke = useMutation({
    mutationFn: (chosen: AssignableRole) =>
      studioApi.revokeMembershipRole(
        organizationId,
        membership.membership_id,
        chosen,
        newCommand(),
      ),
    onSuccess: async () => {
      setRefusal(null)
      /*
       * Re-read rather than patch, and re-read before closing. A permission
       * change is never confirmed from a stale picture — the same rule the
       * grant follows — and here it matters more: revoking coach also moved
       * rows this screen does not show.
       */
      await queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationMembershipsRoot(organizationId),
      })
      setRole('')
      onOpenChange(false)
    },
    onError: (error) => {
      setRefusal(roleRevokeRefusalFor(error instanceof StudioApiError ? error.status : undefined))
    },
  })

  const options = revocableRoles(membership).map((code) => ({
    value: code,
    label: organizationRoleLabel(code as OrganizationRoleCode),
  }))

  const consequence = role
    ? whatRevokingStopsSentence(role as AssignableRole, membership, membership.display_name)
    : null

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (revoke.isPending) return
        onOpenChange(next)
        if (!next) {
          setRole('')
          setRefusal(null)
        }
      }}
    >
      <AlertDialogContent data-team-role-revoke-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirar un rol a {membership.display_name}</AlertDialogTitle>
          <AlertDialogDescription>
            <b>El permiso se pierde en el acto</b>, sin ventana de gracia.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Field>
          <FieldLabel htmlFor={fieldId}>Rol</FieldLabel>
          <Select value={role} onValueChange={(value) => setRole(value ?? '')} items={options}>
            <SelectTrigger id={fieldId} data-studio-select-trigger>
              <SelectValue placeholder="Elige el rol que se retira" />
            </SelectTrigger>
            <SelectContent align="start">
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Nothing until a role is chosen: the consequence depends on which
              one, and a placeholder sentence would be the wrong half the time. */}
          {consequence ? (
            <FieldDescription data-team-role-revoke-consequence>{consequence}</FieldDescription>
          ) : null}
        </Field>

        {refusal ? (
          <Alert variant="danger" live="assertive" data-team-role-revoke-error>
            <AlertTitle>{roleRevokeRefusalTitle(refusal)}</AlertTitle>
            <AlertDescription>{roleRevokeRefusalDescription(refusal)}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!role || revoke.isPending}
            onClick={(event) => {
              // Same as the relationship termination: the dialog stays open
              // through the request, so it can show the spinner and then the
              // refusal rather than vanishing on either.
              event.preventDefault()
              revoke.mutate(role as AssignableRole)
            }}
          >
            {revoke.isPending ? <Spinner label="Retirando el rol" /> : null}
            {revoke.isPending ? 'Retirando…' : 'Retirar rol'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

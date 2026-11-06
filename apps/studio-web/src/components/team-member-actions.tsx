'use client'

/**
 * Everything an administrator can do to one membership, in one control.
 *
 * It exists because the cell grew. Giving a role shipped alone and sat well as
 * a single button; adding "retirar rol" beside it puts two controls in a table
 * cell that is already the narrowest column, and the shared rule below 640px
 * splits a row of children into equal shares — which is how the clients header
 * ended up breaking its labels mid-word (`STUDIO-154`). One trigger stays one
 * trigger however many actions arrive.
 *
 * **The menu owns which dialog is open, and the dialogs live outside it.** A
 * menu item cannot wrap a dialog trigger: clicking the item closes the menu,
 * which unmounts the trigger before the dialog it opened can mount.
 *
 * Each action is offered only when it could do something. A membership that
 * already holds every assignable role is offered no "añadir", and one that
 * holds none is offered no "retirar" — the command would refuse either, and a
 * control whose only outcome is a refusal spends a click to teach nothing.
 *
 * That is why `ownMembershipId` is a prop rather than something read here: the
 * team list is a minimum identity projection with no `person_id`, so the only
 * way to know which row is the reader is to compare membership ids. The
 * command refuses terminating your own membership — leaving is a resignation,
 * a different story — and without this the item would be offered and come back
 * a `422` nobody can interpret.
 */

import { Button } from '@allfitone/react/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import { useState } from 'react'

import { TeamMembershipTermination } from './team-membership-termination'
import { TeamRoleGrant } from './team-role-grant'
import { TeamRoleRevoke } from './team-role-revoke'
import { canTerminateMembership } from '@/lib/team-membership-termination'
import { canLoseARole, canReceiveARole } from '@/lib/team-roles'
import type { OrganizationMembership } from '@/lib/studio-api'

type OpenDialog = 'grant' | 'revoke' | 'terminate' | null

export function TeamMemberActions({
  organizationId,
  membership,
  ownMembershipId,
  mayManageRoles,
  mayManageMemberships,
}: {
  organizationId: string
  membership: OrganizationMembership
  ownMembershipId: string
  mayManageRoles: boolean
  mayManageMemberships: boolean
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null)

  /*
   * Two capabilities, gated separately. `manage_roles` and
   * `manage_memberships` are distinct entries in the server's catalogue, and a
   * reader can hold either without the other — one gate for both would hide
   * an action from somebody allowed to use it, or offer one that comes back a
   * `403`.
   */
  const canGrant = mayManageRoles && canReceiveARole(membership)
  const canRevoke = mayManageRoles && canLoseARole(membership)
  const canTerminate = mayManageMemberships && canTerminateMembership(membership, ownMembershipId)

  // Nothing to offer is not an empty menu: it is no menu. An owner with no
  // other role lands here, and so does every terminated membership.
  if (!canGrant && !canRevoke && !canTerminate) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-team-member-actions
              aria-label={`Acciones sobre ${membership.display_name}`}
            />
          }
        >
          Acciones
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-team-member-actions-menu>
          {canGrant ? (
            <DropdownMenuItem onClick={() => setDialog('grant')}>Añadir rol</DropdownMenuItem>
          ) : null}
          {canRevoke ? (
            <DropdownMenuItem onClick={() => setDialog('revoke')}>Retirar rol</DropdownMenuItem>
          ) : null}
          {/* Below a rule and marked destructive: the two above change what
              somebody may do, this one ends their participation. Drawing them
              at the same weight is what the menu exists to avoid. */}
          {canTerminate && (canGrant || canRevoke) ? <DropdownMenuSeparator /> : null}
          {canTerminate ? (
            <DropdownMenuItem variant="destructive" onClick={() => setDialog('terminate')}>
              Dar de baja
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canGrant ? (
        <TeamRoleGrant
          organizationId={organizationId}
          membership={membership}
          open={dialog === 'grant'}
          onOpenChange={(next) => setDialog(next ? 'grant' : null)}
        />
      ) : null}
      {canRevoke ? (
        <TeamRoleRevoke
          organizationId={organizationId}
          membership={membership}
          open={dialog === 'revoke'}
          onOpenChange={(next) => setDialog(next ? 'revoke' : null)}
        />
      ) : null}
      {canTerminate ? (
        <TeamMembershipTermination
          organizationId={organizationId}
          membership={membership}
          open={dialog === 'terminate'}
          onOpenChange={(next) => setDialog(next ? 'terminate' : null)}
        />
      ) : null}
    </>
  )
}

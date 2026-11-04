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
 */

import { Button } from '@allfitone/react/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import { useState } from 'react'

import { TeamRoleGrant } from './team-role-grant'
import { TeamRoleRevoke } from './team-role-revoke'
import { canLoseARole, canReceiveARole } from '@/lib/team-roles'
import type { OrganizationMembership } from '@/lib/studio-api'

type OpenDialog = 'grant' | 'revoke' | null

export function TeamMemberActions({
  organizationId,
  membership,
}: {
  organizationId: string
  membership: OrganizationMembership
}) {
  const [dialog, setDialog] = useState<OpenDialog>(null)

  const canGrant = canReceiveARole(membership)
  const canRevoke = canLoseARole(membership)

  // Nothing to offer is not an empty menu: it is no menu. An owner with no
  // other role lands here, and so does every terminated membership.
  if (!canGrant && !canRevoke) return null

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
    </>
  )
}

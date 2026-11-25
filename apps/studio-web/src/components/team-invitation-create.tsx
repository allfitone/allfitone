'use client'

/**
 * Inviting somebody to the team: `HU-014`.
 *
 * Two questions, so a dialog over the invitations rather than a page of its
 * own — the shape the library settled for its own creations. The register she
 * was reading stays behind it, and the new invitation appears in it.
 *
 * **There is no result screen any more.** The one this replaced restated what
 * the register behind it already shows for every invitation: the address, the
 * proposed role, when it expires and that it is pending. What it added, and
 * what the notice keeps, is that the command answered — and which of its two
 * answers it gave, since inviting an address that already had an invitation
 * renews that one instead of adding a second.
 *
 * The screen opens this only for a role that may invite, so the dialog asks
 * nothing about roles; a role that changed meanwhile is answered by the
 * command.
 */

import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type TeamInvitationCreate,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'
import {
  INVITATION_CREATE_UNKNOWN_ERROR,
  invitationCreateMessage,
  invitationCreatedNotice,
  invitationRoleOptions,
  type TeamInvitationRole,
} from '@/lib/team-invitations'

export function TeamInvitationCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The invitation lands in the invitations, which is not where this may have been opened. */
  onCreated: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-team-invite>
        <DialogHeader>
          <DialogTitle>Nueva invitación</DialogTitle>
          <DialogDescription>
            No crearemos una cuenta ni una membresía antes de la aceptación.
          </DialogDescription>
        </DialogHeader>
        {/* Inside the popup, so closing it forgets what was typed. */}
        <TeamInvitationCreateForm
          onCancel={() => onOpenChange(false)}
          onCreated={() => {
            onOpenChange(false)
            onCreated()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function TeamInvitationCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const roleOptions = invitationRoleOptions(current.roles)
  const [contact, setContact] = useState('')
  const [role, setRole] = useState<TeamInvitationRole>(roleOptions[0]?.value ?? 'staff')
  const [command, setCommand] = useState(newCommand)
  const [error, setError] = useState<string>()

  const createMutation = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: TeamInvitationCreate; command: CommandHeaders },
      signal,
    ) => studioApi.createTeamInvitation(current.organization_id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationInvitationsRoot(current.organization_id),
      })
    },
  })

  const submitting = createMutation.isPending

  function change(next: { contact?: string; role?: TeamInvitationRole }) {
    if (next.contact !== undefined) setContact(next.contact)
    if (next.role !== undefined) setRole(next.role)
    // Different data is a different command: reusing the key would replay the
    // first invitation under the second address.
    setCommand(newCommand())
    setError(undefined)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || !contact.trim()) return
    setError(undefined)
    try {
      const invitation = await createMutation.mutateAsync({
        body: {
          channel: 'email',
          contact: contact.trim().toLowerCase(),
          intents: [{ kind: 'membership', proposed_role_code: role }],
        },
        command,
      })
      toast.success(invitationCreatedNotice(invitation.contact_hint, invitation.reused))
      onCreated()
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setError(
        caught instanceof StudioApiError
          ? invitationCreateMessage(caught)
          : INVITATION_CREATE_UNKNOWN_ERROR,
      )
    }
  }

  return (
    <form data-studio-form onSubmit={submit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="invitation-email">Correo electrónico</FieldLabel>
          <Input
            id="invitation-email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            value={contact}
            onChange={(event) => change({ contact: event.target.value })}
            required
          />
          <FieldDescription>Solo se usará para entregar esta invitación.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="invitation-role">Rol propuesto</FieldLabel>
          <Select
            value={role}
            onValueChange={(value) => {
              if (value === 'admin' || value === 'coach' || value === 'staff')
                change({ role: value })
            }}
            items={roleOptions}
          >
            <SelectTrigger id="invitation-role" data-studio-select-trigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start">
              {roleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            La persona podrá revisar esta propuesta antes de aceptarla, durante siete días.
          </FieldDescription>
        </Field>
      </FieldGroup>

      {error ? <FieldError>{error}</FieldError> : null}

      <DialogFooter>
        <Button type="submit" disabled={submitting || !contact.trim()}>
          {submitting ? 'Enviando…' : 'Enviar invitación'}
        </Button>
        <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancelar
        </Button>
      </DialogFooter>
    </form>
  )
}

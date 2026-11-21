'use client'

/**
 * Creating a program: the first half of `HU-STUDIO-041`.
 *
 * One question, because the command asks one. The sessions are composed
 * afterwards in the draft, which the server opens empty in the same
 * transaction. A dialog over the library, like the template's: the library
 * opens it only for a role that may create, and the command identity is kept
 * across retries of the same name.
 */

import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import {
  PROGRAM_CREATE_UNKNOWN_ERROR,
  programCreateError,
  programCreateMessage,
  programCreateRequest,
} from '@/lib/program-create'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type ProgramCreate,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function ProgramCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-library-create="program">
        <DialogHeader>
          <DialogTitle>Nuevo programa</DialogTitle>
        </DialogHeader>
        {/* Inside the popup, so closing it forgets what was typed. */}
        <ProgramCreateForm onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function ProgramCreateForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const contentPath = `/organizations/${current.organization_id}/content`
  const [title, setTitle] = useState('')
  const [command, setCommand] = useState(newCommand)
  const [error, setError] = useState<string>()
  const [submitted, setSubmitted] = useState(false)

  const createMutation = useStudioSessionMutation({
    mutationFn: ({ body, command }: { body: ProgramCreate; command: CommandHeaders }, signal) =>
      studioApi.createOrganizationProgram(current.organization_id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationProgramsRoot(current.organization_id),
      })
    },
  })

  const submitting = createMutation.isPending
  const titleError = submitted ? programCreateError(title) : undefined

  function change(value: string) {
    setTitle(value)
    // A different name is a different command: reusing the key would replay the first.
    setCommand(newCommand())
    setError(undefined)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (submitting || programCreateError(title)) return
    setError(undefined)
    try {
      const program = await createMutation.mutateAsync({
        body: programCreateRequest(title),
        command,
      })
      router.push(`${contentPath}/programs/${program.id}`)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setError(
        caught instanceof StudioApiError
          ? programCreateMessage(caught)
          : PROGRAM_CREATE_UNKNOWN_ERROR,
      )
    }
  }

  return (
    <form data-studio-form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(titleError)}>
          <FieldLabel htmlFor="program-title">Nombre</FieldLabel>
          <Input
            id="program-title"
            name="title"
            maxLength={160}
            value={title}
            onChange={(event) => change(event.target.value)}
            aria-invalid={Boolean(titleError)}
            required
          />
          {titleError ? <FieldError>{titleError}</FieldError> : null}
        </Field>
      </FieldGroup>

      {error ? <FieldError data-program-create-error>{error}</FieldError> : null}

      <DialogFooter data-library-create-foot>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear programa'}
        </Button>
      </DialogFooter>
    </form>
  )
}

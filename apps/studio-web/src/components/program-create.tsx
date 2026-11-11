'use client'

/**
 * Creating a program: the first half of `HU-STUDIO-041`.
 *
 * One question, because the command asks one. The sessions are composed
 * afterwards in the draft, which the server opens empty in the same
 * transaction. Built on the template form's register: a setup panel, the
 * capability read first, and the command identity kept across retries of the
 * same name.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  SetupPanel,
  SetupPanelActions,
  SetupPanelContent,
  SetupPanelDescription,
  SetupPanelEyebrow,
  SetupPanelIntro,
  SetupPanelTitle,
} from '@allfitone/react/components/setup-shell'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import { canManageContent } from '@/lib/organization-content'
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
import {
  isStudioQuerySessionCancelled,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

export function ProgramCreateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const contentPath = `/organizations/${current.organization_id}/content`
  const rolesQuery = useQuery(organizationRolesQueryOptions(current.organization_id))
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
  const allowed = canManageContent(current.roles, rolesQuery.data?.items)

  // Until the catalogue answers, a form would be a promise and a refusal a guess.
  if (rolesQuery.isPending) return null

  if (!allowed) {
    return (
      <section data-program-create-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no crea contenido</AlertTitle>
          <AlertDescription>
            Crear programas corresponde a quienes tienen el rol de coach, administración o
            propietario en {current.display_name}.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.replace(contentPath)}>
          Volver al contenido
        </Button>
      </section>
    )
  }

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
      router.replace(`${contentPath}/programs/${program.id}`)
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
    <SetupPanel>
      <SetupPanelIntro>
        <SetupPanelEyebrow>Contenido</SetupPanelEyebrow>
        <SetupPanelTitle as="h2">Crea un programa.</SetupPanelTitle>
        <SetupPanelDescription>
          El programa pertenece a {current.display_name}, aunque quedes registrado como su autor.
          Después lo compones con versiones publicadas de vuestras plantillas, semana a semana.
        </SetupPanelDescription>
      </SetupPanelIntro>

      <SetupPanelContent>
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
              <FieldDescription>
                Como lo buscará tu equipo, por ejemplo Hipertrofia de cuatro semanas.
              </FieldDescription>
              {titleError ? <FieldError>{titleError}</FieldError> : null}
            </Field>
          </FieldGroup>

          {error ? <FieldError data-program-create-error>{error}</FieldError> : null}

          <SetupPanelActions>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? 'Creando…' : 'Crear programa'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => router.replace(contentPath)}
            >
              Cancelar
            </Button>
          </SetupPanelActions>
        </form>
      </SetupPanelContent>
    </SetupPanel>
  )
}

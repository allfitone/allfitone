'use client'

/**
 * Creating a session template: `HU-STUDIO-036`.
 *
 * Two questions, because the command asks two. The discipline comes from the
 * catalogue Backoffice publishes and is chosen once; the name is the one the
 * library will show. Everything a session holds is written afterwards, in the
 * draft, which the server opens in the same transaction as the template.
 *
 * Built on the site form's register: a setup panel, the capability read first
 * so the screen says no instead of letting the command answer it, and the
 * command identity kept across retries of the same data.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@allfitone/react/components/select'
import {
  SetupPanel,
  SetupPanelActions,
  SetupPanelContent,
  SetupPanelDescription,
  SetupPanelEyebrow,
  SetupPanelIntro,
  SetupPanelTitle,
} from '@allfitone/react/components/setup-shell'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import { canManageContent } from '@/lib/organization-content'
import {
  TEMPLATE_CREATE_UNKNOWN_ERROR,
  disciplineOptions,
  templateCreateErrors,
  templateCreateMessage,
  templateCreateRequest,
  type TemplateCreateDraft,
} from '@/lib/session-template-create'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type SessionTemplateCreate,
} from '@/lib/studio-api'
import {
  catalogDisciplinesQueryOptions,
  isStudioQuerySessionCancelled,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

export function SessionTemplateCreateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const contentPath = `/organizations/${current.organization_id}/content`
  const rolesQuery = useQuery(organizationRolesQueryOptions(current.organization_id))
  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())
  const [draft, setDraft] = useState<TemplateCreateDraft>({ disciplineCode: '', title: '' })
  const [command, setCommand] = useState(newCommand)
  const [error, setError] = useState<string>()
  const [submitted, setSubmitted] = useState(false)

  const createMutation = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: SessionTemplateCreate; command: CommandHeaders },
      signal,
    ) =>
      studioApi.createOrganizationSessionTemplate(current.organization_id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationSessionTemplatesRoot(current.organization_id),
      })
    },
  })

  const submitting = createMutation.isPending
  const fieldErrors = submitted ? templateCreateErrors(draft) : {}
  const allowed = canManageContent(current.roles, rolesQuery.data?.items)
  const options = disciplineOptions(disciplinesQuery.data?.items ?? [])

  // The catalog is the server's answer on who may do this; until it arrives a
  // form would be a promise and a refusal would be a guess.
  if (rolesQuery.isPending) return null

  if (!allowed) {
    return (
      <section data-template-create-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no crea contenido</AlertTitle>
          <AlertDescription>
            Crear plantillas corresponde a quienes tienen el rol de coach, administración o
            propietario en {current.display_name}.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.replace(contentPath)}>
          Volver al contenido
        </Button>
      </section>
    )
  }

  function change(patch: Partial<TemplateCreateDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }))
    // Different data is a different command: reusing the key would replay the
    // first template under the second name.
    setCommand(newCommand())
    setError(undefined)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (submitting || Object.keys(templateCreateErrors(draft)).length > 0) return
    setError(undefined)
    try {
      await createMutation.mutateAsync({ body: templateCreateRequest(draft), command })
      router.replace(contentPath)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setError(
        caught instanceof StudioApiError
          ? templateCreateMessage(caught)
          : TEMPLATE_CREATE_UNKNOWN_ERROR,
      )
    }
  }

  return (
    <SetupPanel>
      <SetupPanelIntro>
        <SetupPanelEyebrow>Contenido</SetupPanelEyebrow>
        <SetupPanelTitle as="h2">Crea una plantilla de sesión.</SetupPanelTitle>
        <SetupPanelDescription>
          La plantilla pertenece a {current.display_name}, aunque quedes registrado como su autor.
          Después escribes su borrador, y nada se puede asignar hasta que lo publiques.
        </SetupPanelDescription>
      </SetupPanelIntro>

      <SetupPanelContent>
        {disciplinesQuery.isPending ? (
          <div data-content-catalog-state>
            <Spinner label="Cargando las disciplinas" />
            <p>Cargando las disciplinas…</p>
          </div>
        ) : null}

        {disciplinesQuery.isError ? (
          <Alert variant="danger" live="polite">
            <AlertTitle>No pudimos cargar las disciplinas</AlertTitle>
            <AlertDescription>
              La conexión falló de forma temporal. Sin ellas no se puede crear una plantilla.
            </AlertDescription>
            <AlertAction>
              <Button variant="outline" onClick={() => void disciplinesQuery.refetch()}>
                Reintentar
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {disciplinesQuery.isSuccess && options.length === 0 ? (
          <Alert variant="warning" live="polite" data-template-create-no-disciplines>
            <AlertTitle>Todavía no hay disciplinas publicadas</AlertTitle>
            <AlertDescription>
              Cada plantilla pertenece a una disciplina del catálogo de Allfit, y aún no se ha
              publicado ninguna. Cuando exista, podrás crear plantillas aquí.
            </AlertDescription>
          </Alert>
        ) : null}

        {disciplinesQuery.isSuccess && options.length > 0 ? (
          <form data-studio-form onSubmit={submit} noValidate>
            <FieldGroup>
              <Field data-invalid={Boolean(fieldErrors.discipline)}>
                <FieldLabel htmlFor="template-discipline">Disciplina</FieldLabel>
                <Select
                  value={draft.disciplineCode || null}
                  onValueChange={(value) => change({ disciplineCode: value ?? '' })}
                  items={options}
                >
                  <SelectTrigger
                    id="template-discipline"
                    data-studio-select-trigger
                    aria-invalid={Boolean(fieldErrors.discipline)}
                  >
                    <SelectValue placeholder="Elige una disciplina" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* The contract has no way to move a template to another
                    discipline, so the choice is said to be final up front. */}
                <FieldDescription>
                  Decide qué tipos de actividad y qué movimientos puede llevar. No se cambia
                  después.
                </FieldDescription>
                {fieldErrors.discipline ? <FieldError>{fieldErrors.discipline}</FieldError> : null}
              </Field>
              <Field data-invalid={Boolean(fieldErrors.title)}>
                <FieldLabel htmlFor="template-title">Nombre</FieldLabel>
                <Input
                  id="template-title"
                  name="title"
                  maxLength={160}
                  value={draft.title}
                  onChange={(event) => change({ title: event.target.value })}
                  aria-invalid={Boolean(fieldErrors.title)}
                  required
                />
                <FieldDescription>
                  Como lo buscará tu equipo, por ejemplo Fuerza tren superior.
                </FieldDescription>
                {fieldErrors.title ? <FieldError>{fieldErrors.title}</FieldError> : null}
              </Field>
            </FieldGroup>

            {error ? <FieldError data-template-create-error>{error}</FieldError> : null}

            <SetupPanelActions>
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting ? 'Creando…' : 'Crear plantilla'}
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
        ) : null}
      </SetupPanelContent>
    </SetupPanel>
  )
}

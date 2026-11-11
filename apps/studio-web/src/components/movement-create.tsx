'use client'

/**
 * Creating a gym's own movement: `HU-STUDIO-064`.
 *
 * Its five criteria, and who holds each:
 *
 * 1. **Only our organization sees it.** The server's: the movement is scoped
 *    to the organization, and the search never shows another's. Said here.
 * 2. **It can be a variant of a global movement.** The variant field, whose
 *    picker offers the global library only.
 * 3. **No disciplines or activity types are created here.** The discipline is
 *    chosen from what Allfit has published, and there is nothing else to pick.
 * 4. **A repeated name is refused, not duplicated.** A `409` whose first issue
 *    is `name-taken`, shown on the name field.
 * 5. **Nothing here uploads it to the global catalogue.** There is no such
 *    command, and the screen says so instead of leaving it to be wondered.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import { FieldError } from '@allfitone/react/components/field'
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

import { MovementFields } from './movement-fields'
import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import {
  emptyMovementForm,
  movementCreateRequest,
  movementFormErrors,
  movementIssueMessages,
  type MovementFormDraft,
} from '@/lib/movement-form'
import { canManageContent } from '@/lib/organization-content'
import { disciplineOptions } from '@/lib/session-template-create'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type OrganizationMovementCreate,
} from '@/lib/studio-api'
import {
  catalogDisciplinesQueryOptions,
  isStudioQuerySessionCancelled,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

export function MovementCreateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const contentPath = `/organizations/${organizationId}/content`
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const disciplinesQuery = useQuery(catalogDisciplinesQueryOptions())
  const [draft, setDraft] = useState<MovementFormDraft>(emptyMovementForm)
  const [command, setCommand] = useState(newCommand)
  const [submitted, setSubmitted] = useState(false)
  const [nameTaken, setNameTaken] = useState(false)
  const [issues, setIssues] = useState<string[]>([])
  const [failure, setFailure] = useState<string>()

  const createMutation = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: OrganizationMovementCreate; command: CommandHeaders },
      signal,
    ) => studioApi.createOrganizationMovement(organizationId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationMovementsRoot(organizationId),
      })
    },
  })

  const allowed = canManageContent(current.roles, rolesQuery.data?.items)
  const options = disciplineOptions(disciplinesQuery.data?.items ?? [])
  const errors = submitted ? movementFormErrors(draft) : {}
  const fieldErrors = nameTaken
    ? { ...errors, name: 'Ya hay un movimiento de tu organización con ese nombre.' }
    : errors

  if (rolesQuery.isPending) return null

  if (!allowed) {
    return (
      <section data-program-create-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no crea contenido</AlertTitle>
          <AlertDescription>
            Crear movimientos corresponde a quienes tienen el rol de coach, administración o
            propietario en {current.display_name}.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.replace(contentPath)}>
          Volver al contenido
        </Button>
      </section>
    )
  }

  function change(patch: Partial<MovementFormDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }))
    // Different data is a different command: the old key would replay the first movement.
    setCommand(newCommand())
    setNameTaken(false)
    setIssues([])
    setFailure(undefined)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (createMutation.isPending || Object.keys(movementFormErrors(draft)).length > 0) return
    setIssues([])
    setFailure(undefined)
    try {
      const movement = await createMutation.mutateAsync({
        body: movementCreateRequest(draft),
        command,
      })
      router.replace(`${contentPath}/movements/${movement.id}`)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      if (!(caught instanceof StudioApiError)) {
        setFailure(CREATE_UNKNOWN_FAILURE)
        return
      }
      const codes = caught.issues.map((issue) => issue.code)
      // Criterion 4: the repeated name is said on the name.
      if (codes.includes('name-taken')) {
        setNameTaken(true)
        return
      }
      if (caught.status === 422 && codes.length > 0) {
        setIssues(movementIssueMessages(codes))
        return
      }
      setFailure(createFailure(caught))
    }
  }

  return (
    <SetupPanel>
      <SetupPanelIntro>
        <SetupPanelEyebrow>Contenido</SetupPanelEyebrow>
        <SetupPanelTitle as="h2">Crea un movimiento propio.</SetupPanelTitle>
        {/* Criteria 1 and 5, before anything is typed. */}
        <SetupPanelDescription>
          Para usar vuestra propia terminología y variantes. Solo lo ve {current.display_name}, y no
          hay forma de subirlo al catálogo de Allfit: ese catálogo lo carga Allfit.
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
              La conexión falló de forma temporal. Sin ellas no se puede crear un movimiento.
            </AlertDescription>
            <AlertAction>
              <Button variant="outline" onClick={() => void disciplinesQuery.refetch()}>
                Reintentar
              </Button>
            </AlertAction>
          </Alert>
        ) : null}

        {disciplinesQuery.isSuccess && options.length === 0 ? (
          <Alert variant="warning" live="polite">
            <AlertTitle>Todavía no hay disciplinas publicadas</AlertTitle>
            <AlertDescription>
              Cada movimiento pertenece a una disciplina del catálogo de Allfit, y aún no se ha
              publicado ninguna.
            </AlertDescription>
          </Alert>
        ) : null}

        {disciplinesQuery.isSuccess && options.length > 0 ? (
          <form data-studio-form onSubmit={submit} noValidate>
            <MovementFields
              draft={draft}
              errors={fieldErrors}
              disciplines={options}
              organizationId={organizationId}
              onChange={change}
            />

            {issues.length > 0 ? (
              <Alert variant="danger" live="polite" data-movement-issues>
                <AlertTitle>El servidor no aceptó el movimiento</AlertTitle>
                <AlertDescription>
                  <ul>
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {failure ? <FieldError data-movement-error>{failure}</FieldError> : null}

            <SetupPanelActions>
              <Button type="submit" size="lg" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear movimiento'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={createMutation.isPending}
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

const CREATE_UNKNOWN_FAILURE =
  'No pudimos crear el movimiento. Conservamos el intento para que puedas reintentar.'

function createFailure(error: StudioApiError): string {
  if (error.status === 403 || error.status === 404) {
    return 'Tu rol ya no crea contenido en esta organización, o la organización no está activa.'
  }
  if (error.status === 409 || error.status === 429) {
    return 'Esa creación ya está en curso. Espera un momento y reintenta sin cambiar los datos.'
  }
  if (error.status === 503) {
    return 'La creación de contenido está pausada temporalmente. Reintenta más tarde.'
  }
  return CREATE_UNKNOWN_FAILURE
}

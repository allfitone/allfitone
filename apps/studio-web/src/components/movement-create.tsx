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
 *
 * A dialog over the library, like the template's and the program's. The
 * library opens it only for a role that may create.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import { FieldError } from '@allfitone/react/components/field'
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
  studioQueryKeys,
} from '@/lib/studio-query'

export function MovementCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { current } = useOrganizationContext()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-library-create="movement">
        <DialogHeader>
          <DialogTitle>Nuevo movimiento</DialogTitle>
          {/* Criteria 1 and 5, before anything is typed. */}
          <DialogDescription>
            Solo lo ve {current.display_name}, y no hay forma de subirlo al catálogo de Allfit: ese
            catálogo lo carga Allfit.
          </DialogDescription>
        </DialogHeader>
        {/* Inside the popup, so closing it forgets what was typed. */}
        <MovementCreateForm onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function MovementCreateForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const contentPath = `/organizations/${organizationId}/content`
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

  const options = disciplineOptions(disciplinesQuery.data?.items ?? [])
  const errors = submitted ? movementFormErrors(draft) : {}
  const fieldErrors = nameTaken
    ? { ...errors, name: 'Ya hay un movimiento de tu organización con ese nombre.' }
    : errors

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
      router.push(`${contentPath}/movements/${movement.id}`)
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

  if (disciplinesQuery.isPending) {
    return (
      <div data-content-catalog-state>
        <Spinner label="Cargando las disciplinas" />
        <p>Cargando las disciplinas…</p>
      </div>
    )
  }

  if (disciplinesQuery.isError) {
    return (
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
    )
  }

  if (options.length === 0) {
    return (
      <Alert variant="warning" live="polite">
        <AlertTitle>Todavía no hay disciplinas publicadas</AlertTitle>
        <AlertDescription>
          Cada movimiento pertenece a una disciplina del catálogo de Allfit, y aún no se ha
          publicado ninguna.
        </AlertDescription>
      </Alert>
    )
  }

  return (
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

      <DialogFooter data-library-create-foot>
        <Button
          type="button"
          variant="outline"
          disabled={createMutation.isPending}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Creando…' : 'Crear movimiento'}
        </Button>
      </DialogFooter>
    </form>
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

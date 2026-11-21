'use client'

/**
 * Creating a session template: `HU-STUDIO-036`.
 *
 * Two questions, because the command asks two. The discipline comes from the
 * catalogue Backoffice publishes and is chosen once; the name is the one the
 * library will show. Everything a session holds is written afterwards, in the
 * draft, which the server opens in the same transaction as the template.
 *
 * A dialog over the library rather than a page of its own: two fields do not
 * need a screen, and the list she was reading stays behind them. The library
 * opens it only for a role that may create, so the dialog asks nothing about
 * roles; a role that changed meanwhile is answered by the command.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogContent,
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
import { Spinner } from '@allfitone/react/components/spinner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
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
  studioQueryKeys,
} from '@/lib/studio-query'

export function SessionTemplateCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-library-create="template">
        <DialogHeader>
          <DialogTitle>Nueva plantilla</DialogTitle>
        </DialogHeader>
        {/* Inside the popup, so closing it forgets what was typed. */}
        <SessionTemplateCreateForm onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function SessionTemplateCreateForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const contentPath = `/organizations/${current.organization_id}/content`
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
  const options = disciplineOptions(disciplinesQuery.data?.items ?? [])

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
      const template = await createMutation.mutateAsync({
        body: templateCreateRequest(draft),
        command,
      })
      // Straight into the draft the server opened with it: that is the next thing to do.
      router.push(`${contentPath}/templates/${template.id}`)
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
          La conexión falló de forma temporal. Sin ellas no se puede crear una plantilla.
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
      <Alert variant="warning" live="polite" data-template-create-no-disciplines>
        <AlertTitle>Todavía no hay disciplinas publicadas</AlertTitle>
        <AlertDescription>
          Cada plantilla pertenece a una disciplina del catálogo de Allfit, y aún no se ha publicado
          ninguna. Cuando exista, podrás crear plantillas aquí.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form data-studio-form onSubmit={submit} noValidate>
      <FieldGroup>
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
          {fieldErrors.title ? <FieldError>{fieldErrors.title}</FieldError> : null}
        </Field>
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
          <FieldDescription>No se cambia después.</FieldDescription>
          {fieldErrors.discipline ? <FieldError>{fieldErrors.discipline}</FieldError> : null}
        </Field>
      </FieldGroup>

      {error ? <FieldError data-template-create-error>{error}</FieldError> : null}

      <DialogFooter data-library-create-foot>
        <Button type="button" variant="outline" disabled={submitting} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear plantilla'}
        </Button>
      </DialogFooter>
    </form>
  )
}

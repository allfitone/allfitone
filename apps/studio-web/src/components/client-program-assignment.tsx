'use client'

/**
 * Giving a person a published program version, from her programs screen:
 * `HU-STUDIO-046`.
 *
 * The form asks the two things the command takes and nothing else. What
 * assigning does is not on the form, so the dialog says it before the click:
 * the whole calendar is planted now, the days are resolved in her zone, the
 * relationship it came from never changes, and a clash with another program
 * warns rather than blocks. The rules and their wording are in
 * `@/lib/client-program-assignment`.
 *
 * **The zone is a guess and the screen says so.** Her real zone is whatever her
 * device last sent, and no operation hands it to Studio; the best available is
 * the zone her newest assignment was planted in. So the date is a convenience
 * and the server is the authority — it refuses a day before her today, and that
 * refusal is shown as what it is.
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
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
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
import { type FormEvent, useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { todayIn } from '@/lib/calendar-day'
import {
  assignmentConsequences,
  assignmentDraftError,
  assignmentOutcome,
  assignmentRequest,
  assignmentWriteFailure,
  initialAssignmentDraft,
  retiredTemplatesNote,
  versionChoiceLabel,
  type AssignmentDraft,
  type AssignmentOutcome,
} from '@/lib/client-program-assignment'
import { createCommandIntentManager } from '@/lib/command-intent'
import { proposableVersions, type ProposableVersion } from '@/lib/program-versions'
import {
  newCommand,
  studioApi,
  type CommandHeaders,
  type ProgramAssignmentCreate,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationProgramsQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

/* The catalogue is read to fill one picker, so one page of programs is enough. */
const PROGRAM_PAGE = 100

export function ClientProgramAssignment({
  organizationId,
  relationshipId,
  zone,
  zoneIsHers,
}: {
  organizationId: string
  relationshipId: string
  /** The zone her day is read in, or null when none is known. */
  zone: string | null
  /** True when it came from one of her assignments rather than from the reader. */
  zoneIsHers: boolean
}) {
  const queryClient = useQueryClient()
  const programsQuery = useQuery(organizationProgramsQueryOptions(organizationId, PROGRAM_PAGE))
  const [draft, setDraft] = useState<AssignmentDraft>(() =>
    initialAssignmentDraft(zone, new Date()),
  )
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [submitted, setSubmitted] = useState(false)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState<AssignmentOutcome>()

  const assign = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: ProgramAssignmentCreate; command: CommandHeaders },
      signal,
    ) => studioApi.assignProgramVersion(organizationId, relationshipId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.relationshipAssignmentsRoot(organizationId, relationshipId),
      })
    },
  })

  const offered = proposableVersions(programsQuery.data?.data ?? [])
  const chosen = offered.find((version) => version.version_id === draft.programVersionId)
  /* Her day, recomputed on render: a form left open across midnight must not
     keep yesterday's floor. Empty when no zone is known. */
  const today = zone ? todayIn(zone, new Date()) : ''
  const problem = submitted ? assignmentDraftError(draft, today) : null
  const request = assignmentRequest(draft, zone)

  function change(next: Partial<AssignmentDraft>) {
    setDraft((previous) => ({ ...previous, ...next }))
    setOutcome(undefined)
    setFailure(undefined)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    setOutcome(undefined)
    if (assignmentDraftError(draft, today)) return
    setFailure(undefined)
    setOpen(true)
  }

  async function confirm() {
    setFailure(undefined)
    /* The same version on the same day is one command; either one changed is
       another. That is criterion 6: retrying creates no second assignment. */
    const command = intents.commandFor({
      operation: 'assign-program-version',
      resourceId: relationshipId,
      payload: request,
    })
    try {
      const created = await assign.mutateAsync({ body: request, command })
      intents.reset()
      setOpen(false)
      setSubmitted(false)
      setDraft(initialAssignmentDraft(zone, new Date()))
      setOutcome(assignmentOutcome(created))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setFailure(assignmentWriteFailure(caught))
    }
  }

  return (
    <Card data-client-program-assignment>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Asignarle un programa
        </CardTitle>
        <CardDescription>
          Solo se puede asignar una versión publicada de un programa de esta organización. Su agenda
          se crea en el momento de asignar, resuelta en la zona horaria de ella.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {programsQuery.isPending ? (
          <p data-client-program-assignment-loading>Cargando los programas de la organización…</p>
        ) : programsQuery.isError ? (
          <Alert variant="danger" live="polite" data-client-program-assignment-catalog-failed>
            <AlertTitle>No pudimos cargar los programas</AlertTitle>
            <AlertDescription>
              Sin el catálogo no hay nada que elegir. Vuelve a cargar la pantalla para intentarlo de
              nuevo.
            </AlertDescription>
          </Alert>
        ) : offered.length === 0 ? (
          /* Not a failure: the gym has not published anything yet, and that is
             fixed in the content section and not here. */
          <Alert variant="warning" live="polite" data-client-program-assignment-nothing-published>
            <AlertTitle>Todavía no hay ninguna versión publicada</AlertTitle>
            <AlertDescription>
              Solo se puede asignar una versión publicada. Primero hay que publicar una desde el
              contenido de la organización.
            </AlertDescription>
          </Alert>
        ) : (
          <form data-studio-form onSubmit={submit} noValidate>
            <FieldGroup>
              <Field data-invalid={Boolean(problem) && draft.programVersionId === ''}>
                <FieldLabel htmlFor="client-program-version">Programa</FieldLabel>
                <Select
                  value={draft.programVersionId}
                  onValueChange={(value) => change({ programVersionId: value ?? '' })}
                  items={offered.map((version) => ({
                    value: version.version_id,
                    label: versionChoiceLabel(version),
                  }))}
                >
                  <SelectTrigger id="client-program-version" data-studio-select-trigger>
                    <SelectValue placeholder="Elige una versión publicada" />
                  </SelectTrigger>
                  <SelectContent align="start">
                    {offered.map((version) => (
                      <SelectItem key={version.version_id} value={version.version_id}>
                        {versionChoiceLabel(version)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chosen ? <ChosenVersionNote version={chosen} /> : null}
              </Field>

              <Field data-invalid={Boolean(problem) && draft.programVersionId !== ''}>
                <FieldLabel htmlFor="client-program-start">Empieza</FieldLabel>
                <Input
                  id="client-program-start"
                  type="date"
                  value={draft.startsOn}
                  {...(today ? { min: today } : {})}
                  aria-invalid={Boolean(problem) && draft.programVersionId !== ''}
                  onChange={(event) => change({ startsOn: event.target.value })}
                />
                <FieldDescription data-client-program-zone>
                  {zone
                    ? zoneIsHers
                      ? `El día se resuelve en la zona de ella, ${zone}, que es la de su último programa.`
                      : `No sabemos su zona todavía, así que el día se propone en la nuestra, ${zone}. El servidor lo compara con el día de ella.`
                    : 'No sabemos en qué zona está, así que elige el día a conciencia: el servidor lo compara con el día de ella.'}
                </FieldDescription>
                {problem ? <FieldError>{problem}</FieldError> : null}
              </Field>

              <Button type="submit" disabled={assign.isPending}>
                Asignar el programa
              </Button>
            </FieldGroup>
          </form>
        )}

        {outcome ? (
          <Alert
            variant={outcome.overlaps ? 'warning' : 'success'}
            live="polite"
            data-client-program-assignment-outcome
          >
            <AlertTitle>{outcome.title}</AlertTitle>
            <AlertDescription>{outcome.description}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent data-client-program-assignment-dialog>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {chosen ? `Asignarle «${chosen.title}»` : 'Asignarle el programa'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esto es lo que pasa al confirmar, y no se deshace desde aquí.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {chosen
            ? assignmentConsequences(chosen).map((line) => (
                <p key={line} data-client-program-assignment-consequence>
                  {line}
                </p>
              ))
            : null}

          {failure ? (
            <Alert variant="danger" live="assertive" data-client-program-assignment-failure>
              <AlertTitle>No se asignó el programa</AlertTitle>
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assign.isPending}>No asignar</AlertDialogCancel>
            <AlertDialogAction
              disabled={assign.isPending}
              onClick={(event) => {
                event.preventDefault()
                void confirm()
              }}
            >
              {assign.isPending ? <Spinner label="Asignando el programa" /> : null}
              {assign.isPending ? 'Asignando…' : 'Asignar y sembrar su agenda'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

/**
 * What the chosen version is, under the picker.
 *
 * The retired-template note is a warning and never a block: the server assigns
 * such a version anyway, and a coach choosing between two deserves to know
 * which one carries them.
 */
function ChosenVersionNote({ version }: { version: ProposableVersion }) {
  const retired = retiredTemplatesNote(version)
  return (
    <>
      <FieldDescription data-client-program-chosen>
        {version.repeats_forever
          ? 'No tiene final: su agenda crece una semana a la vez, a medida que ella llega.'
          : 'Tiene final: toda su agenda queda sembrada en el momento de asignar.'}
      </FieldDescription>
      {retired ? (
        <FieldDescription data-client-program-retired-templates>{retired}</FieldDescription>
      ) : null}
    </>
  )
}

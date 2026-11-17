'use client'

/**
 * Leaving a professional observation on a session: `HU-STUDIO-057`.
 *
 * It sits under the observations the session already shows, because it adds to
 * them and never edits one — and because that is where a coach who has just
 * read them is looking.
 *
 * **Two categories with two different grants** is the thing this form is shaped
 * around. Having her training at the writing level says nothing about whether
 * pain may be written down: that is health context, with its own permission.
 * A category she shared only to read is offered as unavailable and says why,
 * because she can raise it; one she never shared is not offered at all, since
 * drawing it would claim she shared it. The rules are in
 * `@/lib/client-observation`.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@allfitone/react/components/field'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import {
  observationCategoryNote,
  observationContentProblem,
  observationOutcome,
  observationProvenanceNote,
  observationWriteFailure,
  type ObservationCategoryOffer,
} from '@/lib/client-observation'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type ObservationCategory,
  type ObservationProvenance,
  type ProfessionalObservationCreate,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

const CONTENT_LIMIT = 2000

const CATEGORY_LABEL: Readonly<Record<ObservationCategory, string>> = {
  training: 'Cómo entrenó',
  health: 'Dolor o limitación',
}

const PROVENANCE_LABEL: Readonly<Record<ObservationProvenance, string>> = {
  professional_observation: 'Lo observé yo',
  person_declared: 'Me lo dijo ella',
}

export function ClientObservationForm({
  offers,
  executionId,
  organizationId,
  personId,
}: {
  offers: readonly ObservationCategoryOffer[]
  executionId: string
  organizationId: string
  personId: string
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const contentId = useId()
  const writable = offers.filter((offer) => offer.state === 'open')
  const [chosen, setChosen] = useState<ObservationCategory>()
  /*
   * The choice is state; which category is current is derived. Holding the
   * latter would freeze whatever `offers` was on the first render — and the
   * card that fills it arrives after this form is already mounted.
   */
  const category =
    chosen && writable.some((offer) => offer.category === chosen) ? chosen : writable[0]?.category
  const [provenance, setProvenance] = useState<ObservationProvenance>('professional_observation')
  const [content, setContent] = useState('')
  const [showProblem, setShowProblem] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState('')

  const record = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: ProfessionalObservationCreate; command: CommandHeaders },
      signal,
    ) => studioApi.recordClientObservation(organizationId, personId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.clientExecution(organizationId, personId, executionId),
      })
    },
  })

  /*
   * Nothing writable means nothing to draw but the reason. A category she
   * shared only to read is something she can change, so it is said; one she
   * never shared is simply absent from `offers`.
   */
  if (!category) {
    return offers.length > 0 ? <ReadOnlyNote offers={offers} /> : null
  }

  const problem = observationContentProblem(content)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (problem) {
      setShowProblem(true)
      return
    }
    setFailure(undefined)
    /*
     * The contract makes the `Command-Id` the observation's own id, so one
     * intent per what is being written is what keeps a retry from leaving two:
     * change the text or the category and it is a different observation.
     */
    const body: ProfessionalObservationCreate = {
      execution_id: executionId,
      category,
      provenance,
      content: content.trim(),
    }
    const command = intents.commandFor({
      operation: 'record-client-observation',
      resourceId: executionId,
      payload: body,
    })
    try {
      const written = await record.mutateAsync({ body, command })
      intents.reset()
      setContent('')
      setShowProblem(false)
      setOutcome(observationOutcome(written))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      const refusal = caught instanceof StudioApiError ? caught : undefined
      setFailure(observationWriteFailure(refusal?.status ?? 0, refusal?.code, category))
    }
  }

  return (
    <form data-client-observation-form onSubmit={(event) => void submit(event)}>
      {writable.length > 1 ? (
        <FieldSet data-client-observation-kinds>
          <FieldLegend>Qué estás anotando</FieldLegend>
          <ToggleGroup
            value={[category]}
            onValueChange={(chosen: string[]) => {
              const next = chosen[0]
              if (next === 'training' || next === 'health') setChosen(next)
            }}
            aria-label="Categoría de la observación"
            data-client-observation-kind-choice
          >
            {writable.map((offer) => (
              <ToggleGroupItem key={offer.category} value={offer.category}>
                {CATEGORY_LABEL[offer.category]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription data-client-observation-kind-note>
            {observationCategoryNote(category)}
          </FieldDescription>
        </FieldSet>
      ) : (
        <p data-client-observation-kind-note>{observationCategoryNote(category)}</p>
      )}

      <FieldSet data-client-observation-provenance>
        <FieldLegend>De quién es lo que anotas</FieldLegend>
        <ToggleGroup
          value={[provenance]}
          onValueChange={(chosen: string[]) => {
            const next = chosen[0]
            if (next === 'professional_observation' || next === 'person_declared') {
              setProvenance(next)
            }
          }}
          aria-label="Origen de la observación"
          data-client-observation-provenance-choice
        >
          {(['professional_observation', 'person_declared'] as const).map((option) => (
            <ToggleGroupItem key={option} value={option}>
              {PROVENANCE_LABEL[option]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {/* The third criterion, said where it is chosen: a transcription stays
            hers, and nothing else on this screen could say that. */}
        <FieldDescription data-client-observation-provenance-note>
          {observationProvenanceNote(provenance)}
        </FieldDescription>
      </FieldSet>

      <Field data-invalid={Boolean(showProblem && problem)}>
        <FieldLabel htmlFor={contentId}>Tu observación</FieldLabel>
        <Textarea
          id={contentId}
          value={content}
          maxLength={CONTENT_LIMIT}
          rows={4}
          aria-invalid={Boolean(showProblem && problem)}
          onChange={(event) => setContent(event.target.value)}
        />
        <FieldDescription>Ella la lee en su sesión. {content.trim().length}/2.000</FieldDescription>
        {showProblem && problem ? (
          <FieldError data-client-observation-problem>
            {problem === 'empty'
              ? 'Escribe tu observación antes de guardarla.'
              : 'Son más de 2.000 caracteres. Recórtala para poder guardarla.'}
          </FieldError>
        ) : null}
      </Field>

      {failure ? (
        <Alert variant="danger" live="assertive" data-client-observation-failure>
          <AlertTitle>No se guardó</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      <div data-client-observation-actions>
        <Button type="submit" disabled={record.isPending}>
          {record.isPending ? <Spinner label="Guardando la observación" /> : null}
          {record.isPending ? 'Guardando…' : 'Guardar observación'}
        </Button>
      </div>

      <p role="status" aria-live="polite" data-client-observation-outcome>
        {outcome}
      </p>
    </form>
  )
}

/**
 * She shared a category only to read. Said rather than left out, because the
 * level is hers to raise and a coach can ask her for it — which is the same
 * distinction the assignment's permission note makes.
 */
function ReadOnlyNote({ offers }: { offers: readonly ObservationCategoryOffer[] }) {
  const which = offers.map((offer) => CATEGORY_LABEL[offer.category].toLocaleLowerCase('es-CO'))
  return (
    <Alert variant="warning" live="polite" data-client-observation-read-only>
      <AlertTitle>No puedes anotar en esta sesión</AlertTitle>
      <AlertDescription>
        Te compartió {which.join(' y ')} solo para leerlo, así que todavía no puedes dejar tu
        observación. Hace falta que lo suba a nivel de registro, y eso lo decide ella.
      </AlertDescription>
    </Alert>
  )
}

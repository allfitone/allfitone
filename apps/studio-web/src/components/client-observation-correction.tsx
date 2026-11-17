'use client'

/**
 * Correcting an observation of one's own: `HU-STUDIO-058`.
 *
 * It sits on the row it corrects, and only on rows this coach wrote: anybody
 * else's observation, a value she declared and anything a device captured are
 * not his to change, so there is no control on them to press. The rules are in
 * `@/lib/client-observation`.
 *
 * **The draft is captured when the dialog opens**, text and revision together.
 * That is deliberate: a refetch while he is typing must not quietly move the
 * revision he is correcting over, or he would overwrite text he never read.
 * Sending the revision he opened means the server answers `stale-draft`
 * instead, and the screen can show him what it says now.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@allfitone/react/components/dialog'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import {
  REASON_LIMIT,
  observationCorrectionFailure,
  observationCorrectionNote,
  observationCorrectionOutcome,
  observationCorrectionProblem,
  observationFromConflict,
  observationReasonProblem,
} from '@/lib/client-observation'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type ProfessionalObservation,
  type ProfessionalObservationRevisionCreate,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

const CONTENT_LIMIT = 2000

/**
 * The correction being written: which revision it is made over, the text it
 * replaces, and what the coach has typed. One object because the four must
 * agree — an open dialog is one that has a draft.
 */
interface CorrectionDraft {
  readonly over: number
  readonly original: string
  readonly content: string
  readonly reason: string
}

export function ClientObservationCorrection({
  observation,
  executionId,
  organizationId,
  personId,
}: {
  observation: ProfessionalObservation
  executionId: string
  organizationId: string
  personId: string
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const contentId = useId()
  const reasonId = useId()
  const [draft, setDraft] = useState<CorrectionDraft>()
  const [showProblems, setShowProblems] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [moved, setMoved] = useState<ProfessionalObservation>()
  const [outcome, setOutcome] = useState('')

  const revise = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: ProfessionalObservationRevisionCreate; command: CommandHeaders },
      signal,
    ) => studioApi.reviseClientObservation(organizationId, observation.id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.clientExecution(organizationId, personId, executionId),
      })
    },
  })

  const contentProblem = draft ? observationCorrectionProblem(draft.content, draft.original) : null
  const reasonProblem = draft ? observationReasonProblem(draft.reason) : null

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!draft) return
    if (contentProblem || reasonProblem) {
      setShowProblems(true)
      return
    }
    setFailure(undefined)
    /*
     * The `Command-Id` becomes the revision's own id, so one intent per what is
     * being corrected: change the text, the reason or the revision underneath
     * and it is a different correction.
     */
    const body: ProfessionalObservationRevisionCreate = {
      expected_revision: draft.over,
      content: draft.content.trim(),
      reason: draft.reason.trim(),
    }
    const command = intents.commandFor({
      operation: 'revise-client-observation',
      resourceId: observation.id,
      payload: body,
    })
    try {
      const corrected = await revise.mutateAsync({ body, command })
      intents.reset()
      setDraft(undefined)
      setShowProblems(false)
      setMoved(undefined)
      setOutcome(observationCorrectionOutcome(corrected))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      const refusal = caught instanceof StudioApiError ? caught : undefined
      if (refusal?.code === 'stale-draft') {
        /*
         * Not a failure: he corrected it from somewhere else, and the answer
         * hands back what it says now. His text stays and the draft moves onto
         * that revision, so pressing again corrects over what he was shown.
         */
        const current = observationFromConflict(refusal.currentState)
        setMoved(current)
        intents.reset()
        if (current) {
          setDraft({ ...draft, over: current.revision_number, original: current.content })
          return
        }
      }
      setFailure(
        observationCorrectionFailure(refusal?.status ?? 0, refusal?.code, observation.category),
      )
    }
  }

  return (
    <div data-client-observation-correction>
      <Dialog
        open={draft !== undefined}
        onOpenChange={(next) => {
          // Closing mid-flight would hide a correction that is still going to land.
          if (revise.isPending) return
          if (next) {
            setOutcome('')
            setDraft({
              over: observation.revision_number,
              original: observation.content,
              content: observation.content,
              reason: '',
            })
            return
          }
          setDraft(undefined)
          setShowProblems(false)
          setFailure(undefined)
          setMoved(undefined)
        }}
      >
        {/* The Design System's own control, not a native button. `outline` at
            `sm`, which is what the rest of Studio uses for an action beside the
            thing it acts on: a bordered button, not an underlined link. */}
        <DialogTrigger
          render={
            <Button type="button" variant="outline" size="sm" data-client-observation-correct />
          }
        >
          Corregir
        </DialogTrigger>
        <DialogContent data-client-observation-correction-dialog>
          <DialogHeader>
            <DialogTitle>
              {observation.provenance === 'person_declared'
                ? 'Corregir lo que transcribiste'
                : 'Corregir tu observación'}
            </DialogTitle>
            {/* What the correction keeps and what it cannot move, before the
                field: afterwards he has already rewritten the text. */}
            <DialogDescription data-client-observation-correction-note>
              {observationCorrectionNote(observation.provenance)}
            </DialogDescription>
          </DialogHeader>

          {moved ? (
            <Alert variant="warning" live="polite" data-client-observation-correction-moved>
              <AlertTitle>Ya la corregiste desde otro lado</AlertTitle>
              <AlertDescription>
                Esto es lo que dice ahora: «{moved.content}». Lo que escribiste sigue abajo; si
                guardas, corriges sobre ese texto.
              </AlertDescription>
            </Alert>
          ) : null}

          <form
            noValidate
            onSubmit={(event) => void submit(event)}
            data-client-observation-correction-form
          >
            <FieldGroup>
              <Field data-invalid={Boolean(showProblems && contentProblem)}>
                <FieldLabel htmlFor={contentId}>Tu observación corregida</FieldLabel>
                <Textarea
                  id={contentId}
                  value={draft?.content ?? ''}
                  maxLength={CONTENT_LIMIT}
                  rows={4}
                  aria-invalid={Boolean(showProblems && contentProblem)}
                  onChange={(event) => {
                    setDraft((current) =>
                      current ? { ...current, content: event.target.value } : current,
                    )
                  }}
                />
                <FieldDescription>
                  Ella lee esta versión en su sesión. {(draft?.content ?? '').trim().length}/2.000
                </FieldDescription>
                {showProblems && contentProblem ? (
                  <FieldError data-client-observation-correction-problem>
                    {CONTENT_PROBLEM[contentProblem]}
                  </FieldError>
                ) : null}
              </Field>

              <Field data-invalid={Boolean(showProblems && reasonProblem)}>
                <FieldLabel htmlFor={reasonId}>Motivo del cambio</FieldLabel>
                <Textarea
                  id={reasonId}
                  value={draft?.reason ?? ''}
                  maxLength={REASON_LIMIT}
                  rows={2}
                  aria-invalid={Boolean(showProblems && reasonProblem)}
                  onChange={(event) => {
                    setDraft((current) =>
                      current ? { ...current, reason: event.target.value } : current,
                    )
                  }}
                />
                <FieldDescription>
                  Queda guardado junto al texto anterior. {(draft?.reason ?? '').trim().length}/500
                </FieldDescription>
                {showProblems && reasonProblem ? (
                  <FieldError data-client-observation-correction-reason-problem>
                    {REASON_PROBLEM[reasonProblem]}
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>

            {failure ? (
              <Alert variant="danger" live="assertive" data-client-observation-correction-failure>
                <AlertTitle>No se corrigió</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <DialogClose
                render={<Button type="button" variant="ghost" disabled={revise.isPending} />}
              >
                Dejarla como está
              </DialogClose>
              <Button type="submit" disabled={revise.isPending}>
                {revise.isPending ? <Spinner label="Guardando la corrección" /> : null}
                {revise.isPending ? 'Guardando…' : 'Guardar la corrección'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Empty until a correction lands, and it takes no room until then: the
          row behind the dialog is the proof a sighted reader gets. */}
      <p role="status" aria-live="polite" data-client-observation-correction-outcome>
        {outcome}
      </p>
    </div>
  )
}

const CONTENT_PROBLEM: Readonly<Record<'empty' | 'too-long' | 'unchanged', string>> = {
  empty: 'Escribe el texto corregido antes de guardarlo.',
  'too-long': 'Son más de 2.000 caracteres. Recórtala para poder guardarla.',
  unchanged: 'No cambiaste el texto. Si querías dejarla como está, cierra sin guardar.',
}

const REASON_PROBLEM: Readonly<Record<'empty' | 'too-long', string>> = {
  empty: 'Escribe por qué la estás corrigiendo. Queda guardado con el texto anterior.',
  'too-long': 'Son más de 500 caracteres. Recorta el motivo.',
}

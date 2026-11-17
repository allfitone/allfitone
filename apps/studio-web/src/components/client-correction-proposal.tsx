'use client'

/**
 * Proposing a correction to something she declared: `HU-STUDIO-059`.
 *
 * It sits on the set it points at, and the first thing the dialog says is that
 * **nothing of hers moves**: the control reads like it corrects her data, and
 * it does not. She decides in Space, within thirty days, and her silence is
 * not a yes. The rules are in `@/lib/client-correction-proposal`.
 *
 * **The load is proposed in her own unit.** The operation needs a mass unit and
 * hers is one, so there is nothing to pick: correcting 60 kg proposes
 * kilograms. One control fewer, one way to be wrong fewer.
 *
 * **A field that already waits on her is not offered again.** The screen reads
 * the caller's own pending proposals for that, which is a courtesy and not the
 * rule: one page holds a hundred, so the 409 is what guarantees it.
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
  FieldLegend,
  FieldSet,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type FormEvent } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import {
  PROPOSAL_REASON_LIMIT,
  correctionFieldLabel,
  correctionTargets,
  pendingProposalFor,
  pendingProposalNote,
  proposalFailure,
  proposalNote,
  proposalOutcome,
  proposalReasonProblem,
  proposedValue,
  proposedValueProblem,
} from '@/lib/client-correction-proposal'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type CorrectionField,
  type CorrectionProposalCreate,
  type ExecutionDetailStrengthSet,
  type ProposedCorrection,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

const VALUE_PROBLEM: Readonly<
  Record<'empty' | 'not-a-number' | 'out-of-range' | 'not-whole' | 'unchanged', string>
> = {
  empty: 'Escribe el valor que propones.',
  'not-a-number': 'Escribe un número.',
  'not-whole': 'Las repeticiones son un número entero.',
  'out-of-range': 'Ese valor está fuera de lo que el campo admite.',
  unchanged: 'Ese es el valor que ella ya registró, así que no habría nada que corregir.',
}

const REASON_PROBLEM: Readonly<Record<'empty' | 'too-long', string>> = {
  empty: 'Escribe por qué se lo propones. Ella lo lee con la propuesta.',
  'too-long': 'Son más de 500 caracteres. Recorta el motivo.',
}

export function ClientCorrectionProposal({
  set,
  pending,
  executionId,
  organizationId,
  personId,
}: {
  set: ExecutionDetailStrengthSet
  pending: readonly ProposedCorrection[]
  executionId: string
  organizationId: string
  personId: string
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const valueId = useId()
  const reasonId = useId()
  const targets = correctionTargets(set)
  const [chosen, setChosen] = useState<CorrectionField>()
  /*
   * The choice is state; which field is current is derived — the same reason as
   * the observation form: the sets arrive after this is mounted, so holding the
   * derived value would freeze the first render's.
   */
  const target = targets.find((entry) => entry.field === chosen) ?? targets[0]
  const [written, setWritten] = useState('')
  const [reason, setReason] = useState('')
  const [showProblems, setShowProblems] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState('')
  const [open, setOpen] = useState(false)

  const propose = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: CorrectionProposalCreate; command: CommandHeaders },
      signal,
    ) => studioApi.proposeClientCorrection(organizationId, personId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.proposedCorrections(organizationId, 'pending'),
      })
    },
  })

  if (!target) return null

  const waiting = pendingProposalFor(pending, executionId, set.order, target.field)
  const valueProblem = proposedValueProblem(target, written)
  const reasonProblem = proposalReasonProblem(reason)

  const reset = () => {
    setWritten('')
    setReason('')
    setShowProblems(false)
    setFailure(undefined)
    setChosen(undefined)
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (waiting) return
    if (valueProblem || reasonProblem) {
      setShowProblems(true)
      return
    }
    setFailure(undefined)
    const body: CorrectionProposalCreate = {
      execution_id: executionId,
      set_order: set.order,
      field: target.field,
      value: proposedValue(written),
      ...(target.unit === null ? {} : { unit: target.unit }),
      reason: reason.trim(),
    }
    /* One intent per field and per value: a change of mind mints new headers. */
    const command = intents.commandFor({
      operation: 'propose-client-correction',
      resourceId: `${executionId}:${String(set.order)}`,
      payload: body,
    })
    try {
      const proposed = await propose.mutateAsync({ body, command })
      intents.reset()
      setOpen(false)
      reset()
      setOutcome(proposalOutcome(proposed, new Date()))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      const refusal = caught instanceof StudioApiError ? caught : undefined
      setFailure(proposalFailure(refusal?.status ?? 0, refusal?.code, refusal?.issues ?? []))
    }
  }

  return (
    <div data-client-correction-proposal>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Closing mid-flight would hide a proposal that is still going to land.
          if (propose.isPending) return
          setOpen(next)
          if (next) setOutcome('')
          else reset()
        }}
      >
        <DialogTrigger
          render={
            <Button type="button" variant="outline" size="sm" data-client-correction-propose />
          }
        >
          Proponer una corrección
        </DialogTrigger>
        <DialogContent data-client-correction-dialog>
          <DialogHeader>
            <DialogTitle>
              Proponer una corrección{set.movement_name ? ` · ${set.movement_name}` : ''}
            </DialogTitle>
            {/* The first criterion, before the field: the button reads as if it
                corrected her data, and it does not. */}
            <DialogDescription data-client-correction-note>{proposalNote()}</DialogDescription>
          </DialogHeader>

          <form
            noValidate
            onSubmit={(event) => void submit(event)}
            data-client-correction-proposal-form
          >
            {targets.length > 1 ? (
              <FieldSet>
                <FieldLegend>Qué dato propones corregir</FieldLegend>
                <ToggleGroup
                  value={[target.field]}
                  onValueChange={(picked: string[]) => {
                    const next = picked[0]
                    if (next === 'achieved_reps' || next === 'load' || next === 'rpe') {
                      setChosen(next)
                      setWritten('')
                      setShowProblems(false)
                      setFailure(undefined)
                    }
                  }}
                  aria-label="Dato de la serie"
                  data-client-correction-field-choice
                >
                  {targets.map((entry) => (
                    <ToggleGroupItem key={entry.field} value={entry.field}>
                      {correctionFieldLabel(entry.field)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            ) : null}

            {waiting ? (
              /* The fifth criterion: not offered twice, and the reason said. */
              <Alert variant="warning" live="polite" data-client-correction-waiting>
                <AlertTitle>Ya hay una propuesta esperando</AlertTitle>
                <AlertDescription>{pendingProposalNote(waiting, new Date())}</AlertDescription>
              </Alert>
            ) : (
              <FieldGroup>
                <Field data-invalid={Boolean(showProblems && valueProblem)}>
                  <FieldLabel htmlFor={valueId}>
                    {correctionFieldLabel(target.field)} que propones
                    {target.unit === null ? '' : ` (${target.unit})`}
                  </FieldLabel>
                  <Input
                    id={valueId}
                    value={written}
                    inputMode="decimal"
                    aria-invalid={Boolean(showProblems && valueProblem)}
                    onChange={(event) => setWritten(event.target.value)}
                  />
                  {/* Her value, so he corrects against what she wrote and not
                      against memory. */}
                  <FieldDescription data-client-correction-declared>
                    Ella registró {String(target.declared)}
                    {target.unit === null ? '' : ` ${target.unit}`}.
                  </FieldDescription>
                  {showProblems && valueProblem ? (
                    <FieldError data-client-correction-value-problem>
                      {VALUE_PROBLEM[valueProblem]}
                    </FieldError>
                  ) : null}
                </Field>

                <Field data-invalid={Boolean(showProblems && reasonProblem)}>
                  <FieldLabel htmlFor={reasonId}>Por qué se lo propones</FieldLabel>
                  <Textarea
                    id={reasonId}
                    value={reason}
                    maxLength={PROPOSAL_REASON_LIMIT}
                    rows={3}
                    aria-invalid={Boolean(showProblems && reasonProblem)}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <FieldDescription>
                    Ella lo lee con la propuesta y sabe que viene de ti. {reason.trim().length}/500
                  </FieldDescription>
                  {showProblems && reasonProblem ? (
                    <FieldError data-client-correction-reason-problem>
                      {REASON_PROBLEM[reasonProblem]}
                    </FieldError>
                  ) : null}
                </Field>
              </FieldGroup>
            )}

            {failure ? (
              <Alert variant="danger" live="assertive" data-client-correction-failure>
                <AlertTitle>No se propuso</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <DialogClose
                render={<Button type="button" variant="ghost" disabled={propose.isPending} />}
              >
                {waiting ? 'Cerrar' : 'Dejarlo así'}
              </DialogClose>
              {waiting ? null : (
                <Button type="submit" disabled={propose.isPending}>
                  {propose.isPending ? <Spinner label="Enviando la propuesta" /> : null}
                  {propose.isPending ? 'Enviando…' : 'Enviar la propuesta'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Empty until a proposal lands, and it takes no room until then. */}
      <p role="status" aria-live="polite" data-client-correction-outcome>
        {outcome}
      </p>
    </div>
  )
}

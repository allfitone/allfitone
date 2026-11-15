'use client'

/**
 * `HU-STUDIO-071`. Proposing a client a version of her nutrition goals.
 *
 * A dialog, and what it says first is that **nothing changes yet**: the button
 * reads like it sets her goal, and it does not. She decides in Space, and her
 * goal today stays as it is (criterion 2). In the same breath, what it is not: a
 * menu or a clinical indication (criterion 5). There is nowhere to write a food.
 *
 * **Proposing twice is not offering two options** (criterion 4). A new proposal
 * replaces the one still waiting on her, so the dialog says so before sending
 * whenever one is waiting — never after.
 *
 * **Six rows, one per nutrient**, each with its fixed unit: the form is what the
 * contract closes, not a list that grows. The rules are in
 * `nutrition-goal-proposal.ts`.
 *
 * **It needs a connection** (criterion 7). A dropped one keeps what was typed,
 * and the same proposal is sent again as the same command, so a retry never
 * creates a second one.
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
  FieldLabel,
  FieldLegend,
  FieldSet,
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
import { Textarea } from '@allfitone/react/components/textarea'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useId, useState, type FormEvent } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  GOAL_NUTRIENTS,
  MODE_OPTIONS,
  RATIONALE_LIMIT,
  amountCaption,
  draftFields,
  draftMode,
  emptyProposalDraft,
  proposalBody,
  proposalProblems,
  proposalRefusal,
  proposalRefusalDescription,
  proposalRefusalTitle,
  rationaleProblemText,
  replacesLine,
  targetProblemText,
  type ProposalDraft,
  type ProposalRefusal,
  type TargetDraft,
  type TargetProblem,
} from '@/lib/nutrition-goal-proposal'
import { nutrientName } from '@/lib/nutrients'
import { StudioApiError, newCommand, studioApi } from '@/lib/studio-api'
import type {
  ClientNutritionGoalVersion,
  CommandHeaders,
  ProfessionalNutritionGoalVersionCreate,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function NutritionGoalProposal({
  organizationId,
  personId,
  pending,
  onProposed,
}: {
  organizationId: string
  personId: string
  /** The proposal still waiting on her, which this one would replace. */
  pending: ClientNutritionGoalVersion | null
  onProposed: () => void
}) {
  const queryClient = useQueryClient()
  const rationaleId = useId()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ProposalDraft>(emptyProposalDraft)
  const [submitted, setSubmitted] = useState(false)
  const [refusal, setRefusal] = useState<ProposalRefusal | null>(null)
  const [intents] = useState(() => createCommandIntentManager(newCommand))

  const propose = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: ProfessionalNutritionGoalVersionCreate; command: CommandHeaders },
      signal,
    ) =>
      studioApi.proposeClientNutritionGoalVersion(organizationId, personId, body, command, signal),
  })

  const problems = submitted ? proposalProblems(draft) : null

  function reset() {
    setDraft(emptyProposalDraft())
    setSubmitted(false)
    setRefusal(null)
    intents.reset()
  }

  function change(next: ProposalDraft) {
    setDraft(next)
    setRefusal(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (proposalProblems(draft)) return
    setRefusal(null)
    const body = proposalBody(draft)
    // The same proposal is one command: a retry after a dropped connection creates none.
    const command = intents.commandFor({
      operation: 'propose-nutrition-goal-version',
      resourceId: personId,
      payload: body,
    })
    try {
      await propose.mutateAsync({ body, command })
      setOpen(false)
      reset()
      onProposed()
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.clientNutritionGoalsRoot(organizationId, personId),
      })
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setRefusal(
        caught instanceof StudioApiError
          ? proposalRefusal(caught.status, caught.code)
          : proposalRefusal(undefined, undefined),
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a proposal that is still going to land.
        if (propose.isPending) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" data-client-nutrition-goal-propose />}>
        Proponer objetivos
      </DialogTrigger>
      <DialogContent data-goal-proposal-dialog>
        <DialogHeader>
          <DialogTitle>Proponer objetivos nutricionales</DialogTitle>
          {/* Nothing changes, and what it is not: before the form, because the
              button the reader just pressed suggests the opposite. */}
          <DialogDescription>
            <b>No cambia nada hasta que ella decida.</b> Su meta de hoy sigue igual mientras tanto.
            Son objetivos diarios por nutriente: no es un menú ni una indicación clínica.
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <Alert variant="warning" data-goal-proposal-replaces>
            <AlertTitle>Reemplaza la propuesta que está esperando</AlertTitle>
            <AlertDescription>{replacesLine(pending.created_at)}</AlertDescription>
          </Alert>
        ) : null}

        <form noValidate onSubmit={(event) => void submit(event)} data-goal-proposal-form>
          <FieldSet data-goal-proposal-targets>
            <FieldLegend>Objetivos diarios</FieldLegend>
            <FieldDescription>
              Elige solo los nutrientes que quieras orientar. La unidad de cada uno es fija.
            </FieldDescription>
            {GOAL_NUTRIENTS.map(({ code, unit }) => (
              <TargetRow
                key={code}
                name={nutrientName(code)}
                unit={unit}
                target={draft.targets[code]}
                problem={problems?.targets[code]}
                onChange={(target) =>
                  change({ ...draft, targets: { ...draft.targets, [code]: target } })
                }
              />
            ))}
            {problems?.noTargets ? (
              <FieldError data-goal-proposal-no-targets>Elige al menos un nutriente.</FieldError>
            ) : null}
          </FieldSet>

          <Field data-invalid={Boolean(problems?.rationale)}>
            <FieldLabel htmlFor={rationaleId}>Por qué se lo propones</FieldLabel>
            <Textarea
              id={rationaleId}
              value={draft.rationale}
              maxLength={RATIONALE_LIMIT}
              rows={4}
              aria-invalid={Boolean(problems?.rationale)}
              onChange={(event) => change({ ...draft, rationale: event.target.value })}
            />
            <FieldDescription>
              Ella lo lee con la propuesta y sabe que viene de ti. {draft.rationale.length}/2.000
            </FieldDescription>
            {problems?.rationale ? (
              <FieldError>{rationaleProblemText(problems.rationale)}</FieldError>
            ) : null}
          </Field>

          {refusal ? (
            <Alert variant="danger" live="assertive" data-goal-proposal-refusal>
              <AlertTitle>{proposalRefusalTitle(refusal)}</AlertTitle>
              <AlertDescription>{proposalRefusalDescription(refusal)}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="ghost" disabled={propose.isPending} />}
            >
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={propose.isPending}>
              {propose.isPending ? <Spinner label="Enviando la propuesta" /> : null}
              {propose.isPending ? 'Enviando…' : 'Enviar la propuesta'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One nutrient: whether it has a target, of what kind, and its values in its unit. */
function TargetRow({
  name,
  unit,
  target,
  problem,
  onChange,
}: {
  name: string
  unit: string
  target: TargetDraft
  problem: TargetProblem | undefined
  onChange: (target: TargetDraft) => void
}) {
  const modeId = useId()
  const fields = draftFields(target.mode)
  return (
    <Field data-invalid={problem !== undefined} data-goal-proposal-row>
      <FieldLabel htmlFor={modeId}>{name}</FieldLabel>
      <div data-goal-proposal-controls>
        <Select
          value={target.mode}
          onValueChange={(value) => onChange({ ...target, mode: draftMode(value) })}
          items={[...MODE_OPTIONS]}
        >
          <SelectTrigger id={modeId} data-studio-select-trigger data-goal-proposal-mode>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {MODE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fields.map((field, at) => (
          <Fragment key={field}>
            {at > 0 ? <span data-goal-proposal-joiner>y</span> : null}
            <Input
              value={target[field]}
              inputMode="decimal"
              aria-label={`${name}: ${amountCaption(target.mode, field)} (${unit})`}
              aria-invalid={problem !== undefined}
              data-goal-proposal-amount
              onChange={(event) =>
                onChange(
                  field === 'low'
                    ? { ...target, low: event.target.value }
                    : { ...target, high: event.target.value },
                )
              }
            />
          </Fragment>
        ))}
        {fields.length > 0 ? <span data-goal-proposal-unit>{unit}</span> : null}
      </div>
      {problem ? <FieldError>{targetProblemText(problem, target.mode)}</FieldError> : null}
    </Field>
  )
}

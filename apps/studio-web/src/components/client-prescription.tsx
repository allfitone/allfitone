'use client'

/**
 * Adjusting the prescription for one person: `HU-STUDIO-049`.
 *
 * What the version she was given asks for, routine by routine and step by step,
 * with what this coach adapted for her. **The published routine and the
 * adjustment are drawn side by side and never merged** — that is the first
 * criterion made visible: showing only the adjusted value would leave no way to
 * see that the gym's routine did not move.
 *
 * **What a step admits is its family's business.** A strength step takes sets,
 * reps, load and RPE; an endurance one distance, duration and pace; an interval
 * one rounds, work, rest and RPE; a mobility one the hold, the repetitions and
 * the side. A note fits any of them. The rules are in `@/lib/client-prescription`
 * and the map is the server's own.
 *
 * **Reading this costs her an access record**, so it is read once on arrival and
 * never refreshed by itself, like every other authorized read of her data.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
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
import { Skeleton } from '@allfitone/react/components/skeleton'
import { Spinner } from '@allfitone/react/components/spinner'
import { Textarea } from '@allfitone/react/components/textarea'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'

import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { useStudioSessionMutation } from './studio-query-provider'
import { clientProgramsPath } from '@/lib/client-card'
import {
  ADJUSTMENT_SIDES,
  adjustedLine,
  adjustmentInForce,
  adjustmentKindLabel,
  adjustmentProblem,
  adjustmentUnit,
  adjustmentValue,
  offeredKinds,
  prescriptionNote,
  prescriptionReadFailure,
  prescriptionWriteFailure,
  publishedValue,
  sideLabelFor,
} from '@/lib/client-prescription'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type AssignmentPrescriptionStep,
  type CommandHeaders,
  type PrescriptionAdjustmentKind,
  type PrescriptionRevisionCreate,
} from '@/lib/studio-api'
import {
  assignmentPrescriptionQueryOptions,
  isStudioQuerySessionCancelled,
  studioQueryKeys,
} from '@/lib/studio-query'

const NOTE_LIMIT = 2000

export function ClientPrescriptionScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ personId: string; assignmentId: string }>()
  const organizationId = current.organization_id
  const query = useQuery(assignmentPrescriptionQueryOptions(organizationId, params.assignmentId))
  const programsPath = clientProgramsPath(organizationId, params.personId)

  if (query.isPending) {
    return (
      <div data-client-prescription-screen data-client-prescription-loading>
        <Skeleton data-client-prescription-placeholder />
        <Skeleton data-client-prescription-placeholder />
      </div>
    )
  }

  if (query.error || !query.data) {
    const refusal = query.error instanceof StudioApiError ? query.error : undefined
    return (
      <div data-client-prescription-screen>
        <Alert variant="warning" data-client-prescription-failure>
          <AlertTitle>No pudimos mostrar la prescripción</AlertTitle>
          <AlertDescription>{prescriptionReadFailure(refusal?.status ?? 0)}</AlertDescription>
          <AlertAction>
            <Link
              href={programsPath}
              data-slot="button"
              data-variant="outline"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Volver a sus programas
            </Link>
          </AlertAction>
        </Alert>
      </div>
    )
  }

  const prescription = query.data
  return (
    <div data-client-prescription-screen>
      {/* No heading of its own: the workspace already titles the route, and a
          second `h1` is two first headings on one page. */}
      <WorkspacePageHeader
        description="Lo que la versión que le dimos pide, paso por paso, y lo que ajustaste para ella."
        actions={
          <Link
            href={programsPath}
            data-slot="button"
            data-variant="outline"
            data-client-prescription-back
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Volver a sus programas
          </Link>
        }
      />
      {/* The first criterion, before any control: this does not touch the gym's
          routine. */}
      <p data-client-prescription-note>{prescriptionNote()}</p>

      {prescription.routines.length === 0 ? (
        <p data-client-prescription-empty>Esta versión no tiene rutinas con pasos que ajustar.</p>
      ) : (
        prescription.routines.map((routine) => (
          <Card key={routine.template_version_id} data-client-prescription-routine>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                {routine.title}
              </CardTitle>
              <CardDescription>
                Lo que esta rutina pide, y lo que ajustaste para ella. La rutina del gimnasio no
                cambia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul data-client-prescription-step-list>
                {routine.steps.map((step, index) => (
                  <li key={step.planned_step_id}>
                    <PrescriptionStep
                      step={step}
                      position={index + 1}
                      assignmentId={params.assignmentId}
                      organizationId={organizationId}
                    />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

function PrescriptionStep({
  step,
  position,
  assignmentId,
  organizationId,
}: {
  step: AssignmentPrescriptionStep
  position: number
  assignmentId: string
  organizationId: string
}) {
  const kinds = offeredKinds(step.step)
  const name = movementName(step.step, position)
  return (
    <article data-client-prescription-step>
      <div data-client-prescription-step-head>
        <strong data-client-prescription-step-name>{name}</strong>
        {step.adjustments.length > 0 ? (
          <Badge variant="secondary" data-client-prescription-step-adjusted>
            Ajustado para ella
          </Badge>
        ) : null}
      </div>

      {kinds.length === 0 ? (
        <p data-client-prescription-step-none>
          Este paso no tiene objetivos que se puedan ajustar.
        </p>
      ) : (
        <dl data-client-prescription-targets>
          {kinds.map((kind) => {
            const inForce = adjustmentInForce(step, kind)
            const unit = adjustmentUnit(step.step, kind)
            const published = publishedValue(step.step, kind)
            return (
              <div key={kind} data-client-prescription-target>
                <dt>{adjustmentKindLabel(kind)}</dt>
                <dd>
                  {/* The routine as published and the adjustment in force, side
                      by side: merging them would hide which is which. */}
                  <span data-client-prescription-published>
                    {kind === 'side' && typeof published === 'string'
                      ? `La rutina pide ${sideLabelFor(published)}`
                      : adjustedLine(published, unit)}
                  </span>
                  {inForce ? (
                    <span data-client-prescription-in-force>
                      Ajustado a{' '}
                      <b>
                        {kind === 'side'
                          ? sideLabelFor(String(inForce.value))
                          : String(inForce.value)}
                        {inForce.unit_code === null ? '' : ` ${inForce.unit_code}`}
                      </b>
                    </span>
                  ) : null}
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      {kinds.length > 0 ? (
        <AdjustStep
          step={step}
          kinds={kinds}
          name={name}
          assignmentId={assignmentId}
          organizationId={organizationId}
        />
      ) : null}
    </article>
  )
}

function AdjustStep({
  step,
  kinds,
  name,
  assignmentId,
  organizationId,
}: {
  step: AssignmentPrescriptionStep
  kinds: readonly PrescriptionAdjustmentKind[]
  name: string
  assignmentId: string
  organizationId: string
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const valueId = useId()
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<PrescriptionAdjustmentKind>()
  /* The choice is state; which kind is current is derived — the steps arrive
     after this is mounted, so holding the derived value would freeze it. */
  const kind = chosen && kinds.includes(chosen) ? chosen : kinds[0]
  const [written, setWritten] = useState('')
  const [showProblem, setShowProblem] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState('')

  const revise = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: PrescriptionRevisionCreate; command: CommandHeaders },
      signal,
    ) => studioApi.revisePrescription(organizationId, assignmentId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.assignmentPrescription(organizationId, assignmentId),
      })
    },
  })

  if (!kind) return null

  const inForce = adjustmentInForce(step, kind)
  const unit = adjustmentUnit(step.step, kind)
  const problem = adjustmentProblem(kind, written, inForce)

  const reset = () => {
    setWritten('')
    setShowProblem(false)
    setFailure(undefined)
    setChosen(undefined)
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (problem) {
      setShowProblem(true)
      return
    }
    setFailure(undefined)
    const body: PrescriptionRevisionCreate = {
      planned_step_id: step.planned_step_id,
      kind,
      value: adjustmentValue(kind, written),
      ...(unit === null ? {} : { unit_code: unit }),
    }
    /* One intent per step, kind and value: a change of mind mints new headers
       and a retry of the same adjustment cannot record two revisions. */
    const command = intents.commandFor({
      operation: 'revise-prescription',
      resourceId: `${step.planned_step_id}:${kind}`,
      payload: body,
    })
    try {
      await revise.mutateAsync({ body, command })
      intents.reset()
      setOpen(false)
      reset()
      setOutcome(`Ajustaste ${adjustmentKindLabel(kind).toLocaleLowerCase('es-CO')} para ella.`)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      const refusal = caught instanceof StudioApiError ? caught : undefined
      setFailure(prescriptionWriteFailure(refusal?.status ?? 0, refusal?.code))
    }
  }

  return (
    <div data-client-prescription-adjust>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Closing mid-flight would hide an adjustment that is still landing.
          if (revise.isPending) return
          setOpen(next)
          if (next) setOutcome('')
          else reset()
        }}
      >
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-client-prescription-adjust-open
            />
          }
        >
          Ajustar para ella
        </DialogTrigger>
        <DialogContent data-client-prescription-dialog>
          <DialogHeader>
            <DialogTitle>Ajustar · {name}</DialogTitle>
            <DialogDescription data-client-prescription-dialog-note>
              {prescriptionNote()}
            </DialogDescription>
          </DialogHeader>

          <form noValidate onSubmit={(event) => void submit(event)} data-client-prescription-form>
            {kinds.length > 1 ? (
              <FieldSet>
                <FieldLegend>Qué ajustas</FieldLegend>
                <ToggleGroup
                  value={[kind]}
                  onValueChange={(picked: string[]) => {
                    const next = picked[0]
                    if (next && kinds.includes(next as PrescriptionAdjustmentKind)) {
                      setChosen(next as PrescriptionAdjustmentKind)
                      setWritten('')
                      setShowProblem(false)
                      setFailure(undefined)
                    }
                  }}
                  aria-label="Objetivo que se ajusta"
                  data-client-prescription-kind-choice
                >
                  {kinds.map((option) => (
                    <ToggleGroupItem key={option} value={option}>
                      {adjustmentKindLabel(option)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            ) : null}

            {kind === 'side' ? (
              <FieldSet>
                <FieldLegend>Lado</FieldLegend>
                <ToggleGroup
                  value={written ? [written] : []}
                  onValueChange={(picked: string[]) => {
                    if (picked[0]) setWritten(picked[0])
                  }}
                  aria-label="Lado que se ajusta"
                  data-client-prescription-side-choice
                >
                  {ADJUSTMENT_SIDES.map((side) => (
                    <ToggleGroupItem key={side} value={side}>
                      {sideLabelFor(side)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription data-client-prescription-published-note>
                  {publishedLine(step, kind, unit)}
                </FieldDescription>
                {showProblem && problem ? (
                  <FieldError data-client-prescription-problem>{PROBLEM[problem]}</FieldError>
                ) : null}
              </FieldSet>
            ) : (
              <Field data-invalid={Boolean(showProblem && problem)}>
                <FieldLabel htmlFor={valueId}>
                  {adjustmentKindLabel(kind)}
                  {unit === null ? '' : ` (${unit})`}
                  {SECONDS_KINDS.has(kind) ? ' en segundos' : ''}
                </FieldLabel>
                {kind === 'notes' ? (
                  <Textarea
                    id={valueId}
                    value={written}
                    maxLength={NOTE_LIMIT}
                    rows={3}
                    aria-invalid={Boolean(showProblem && problem)}
                    onChange={(event) => setWritten(event.target.value)}
                  />
                ) : (
                  <Input
                    id={valueId}
                    value={written}
                    inputMode="decimal"
                    aria-invalid={Boolean(showProblem && problem)}
                    onChange={(event) => setWritten(event.target.value)}
                  />
                )}
                <FieldDescription data-client-prescription-published-note>
                  {publishedLine(step, kind, unit)}
                </FieldDescription>
                {showProblem && problem ? (
                  <FieldError data-client-prescription-problem>{PROBLEM[problem]}</FieldError>
                ) : null}
              </Field>
            )}

            {failure ? (
              <Alert variant="danger" live="assertive" data-client-prescription-write-failure>
                <AlertTitle>No se guardó</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <DialogClose
                render={<Button type="button" variant="ghost" disabled={revise.isPending} />}
              >
                Dejarlo como está
              </DialogClose>
              <Button type="submit" disabled={revise.isPending}>
                {revise.isPending ? <Spinner label="Guardando el ajuste" /> : null}
                {revise.isPending ? 'Guardando…' : 'Guardar el ajuste'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Empty until an adjustment lands, and it takes no room until then. */}
      <p role="status" aria-live="polite" data-client-prescription-outcome>
        {outcome}
      </p>
    </div>
  )
}

/** What the routine asks for this kind, and what is in force, said under the field. */
function publishedLine(
  step: AssignmentPrescriptionStep,
  kind: PrescriptionAdjustmentKind,
  unit: string | null,
): string {
  const published = publishedValue(step.step, kind)
  const line =
    kind === 'side' && typeof published === 'string'
      ? `La rutina pide ${sideLabelFor(published)}`
      : adjustedLine(published, unit)
  const inForce = adjustmentInForce(step, kind)
  if (!inForce) return `${line}. Nadie lo ha ajustado para ella.`
  const value = kind === 'side' ? sideLabelFor(String(inForce.value)) : String(inForce.value)
  return `${line}. Hoy está ajustado a ${value}${inForce.unit_code === null ? '' : ` ${inForce.unit_code}`}.`
}

/** The movement a step names, or its number when the routine names none. */
function movementName(step: AssignmentPrescriptionStep['step'], position: number): string {
  const named = (step as { movement_name?: unknown }).movement_name
  return typeof named === 'string' && named.length > 0
    ? `${String(position)}. ${named}`
    : `Paso ${String(position)}`
}

const SECONDS_KINDS = new Set<PrescriptionAdjustmentKind>([
  'target_duration',
  'work_duration',
  'rest_duration',
  'hold_duration',
])

const PROBLEM: Readonly<
  Record<'empty' | 'not-a-number' | 'not-whole' | 'out-of-range' | 'too-long' | 'unchanged', string>
> = {
  empty: 'Escribe el valor que quieres dejarle.',
  'not-a-number': 'Escribe un número.',
  'not-whole': 'Este objetivo es un número entero.',
  'out-of-range': 'Ese valor está fuera de lo que el objetivo admite.',
  'too-long': 'Son más de 2.000 caracteres. Recorta la nota.',
  unchanged: 'Ese es el valor que ya tiene ajustado, así que no habría nada que cambiar.',
}

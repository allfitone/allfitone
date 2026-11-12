'use client'

/**
 * Putting a price on sale, from the plan's own page: `HU-STUDIO-075`.
 *
 * The form asks the four things the command takes and nothing else (criterion
 * 1). What publishing changes is not on the form, so the dialog says it before
 * the click: the price on sale is retired in the same step, nobody subscribed
 * pays more, a published price is never edited, and a remote price cannot be
 * charged yet. The rules and their wording are in `@/lib/plan-publish`.
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
  FieldLegend,
  FieldSet,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { RadioGroup, RadioGroupItem } from '@allfitone/react/components/radio-group'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  amountError,
  initialPublishDraft,
  publishConsequences,
  publishOutcome,
  publishRequest,
  publishTitle,
  publishWriteFailure,
  sameAsOnSale,
  type PublishDraft,
} from '@/lib/plan-publish'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type OrganizationPlan,
  type PlanVersionPublish,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function PlanPublish({
  plan,
  organizationId,
}: {
  plan: OrganizationPlan
  organizationId: string
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<PublishDraft>(() => initialPublishDraft(plan))
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [submitted, setSubmitted] = useState(false)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState('')

  const publish = useStudioSessionMutation({
    mutationFn: (
      { body, command }: { body: PlanVersionPublish; command: CommandHeaders },
      signal,
    ) =>
      studioApi.publishOrganizationPlanVersion(organizationId, plan.plan_id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationPlansRoot(organizationId),
      })
    },
  })

  const request = publishRequest(draft)
  const amountProblem = submitted ? amountError(draft.amount) : undefined
  const unchanged = submitted && !amountProblem && sameAsOnSale(plan, request)

  function change(next: Partial<PublishDraft>) {
    setDraft((previous) => ({ ...previous, ...next }))
    setOutcome('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    setOutcome('')
    if (amountError(draft.amount) || sameAsOnSale(plan, request)) return
    setFailure(undefined)
    setOpen(true)
  }

  async function confirm() {
    setFailure(undefined)
    // The same price confirmed twice is one command; another price is another.
    const command = intents.commandFor({
      operation: 'publish-plan-version',
      resourceId: plan.plan_id,
      payload: request,
    })
    try {
      const after = await publish.mutateAsync({ body: request, command })
      intents.reset()
      setOpen(false)
      setSubmitted(false)
      setOutcome(publishOutcome(plan, after))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setFailure(publishWriteFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <Card data-plan-publish>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {plan.current_version ? 'Cambiar el precio' : 'Publicar un precio'}
        </CardTitle>
        {/* Criteria 2 and 3, before anything is chosen. */}
        <CardDescription>
          Un precio publicado no se edita nunca: cambiarlo es publicar otro, y quien ya está
          suscrito conserva el suyo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form data-studio-form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(amountProblem)}>
              <FieldLabel htmlFor="plan-amount">Precio en pesos colombianos (COP)</FieldLabel>
              <Input
                id="plan-amount"
                inputMode="numeric"
                autoComplete="off"
                value={draft.amount}
                aria-invalid={Boolean(amountProblem)}
                onChange={(event) => change({ amount: event.target.value })}
              />
              <FieldDescription>
                Pesos enteros, sin centavos. Es la única moneda, porque Mercado Pago Colombia cobra
                en pesos.
              </FieldDescription>
              {amountProblem ? <FieldError>{amountProblem}</FieldError> : null}
            </Field>

            <FieldSet>
              <FieldLegend>Cobro</FieldLegend>
              <RadioGroup
                value={draft.period}
                aria-label="Cobro"
                onValueChange={(value) => {
                  if (value === 'month' || value === 'year') change({ period: value })
                }}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem id="plan-period-month" value="month" />
                  <FieldLabel htmlFor="plan-period-month">Mensual</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="plan-period-year" value="year" />
                  <FieldLabel htmlFor="plan-period-year">Anual</FieldLabel>
                </Field>
              </RadioGroup>
              <FieldDescription>
                Mensual y anual son precios distintos: para vender los dos, crea un plan para cada
                uno.
              </FieldDescription>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Modalidad</FieldLegend>
              <RadioGroup
                value={draft.delivery}
                aria-label="Modalidad"
                onValueChange={(value) => {
                  if (value === 'in_person' || value === 'remote') change({ delivery: value })
                }}
              >
                <Field orientation="horizontal">
                  <RadioGroupItem id="plan-delivery-in-person" value="in_person" />
                  <FieldLabel htmlFor="plan-delivery-in-person">Presencial</FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="plan-delivery-remote" value="remote" />
                  <FieldLabel htmlFor="plan-delivery-remote">Remoto</FieldLabel>
                </Field>
              </RadioGroup>
              {/* Criterion 4, and the link that does not exist yet (HU-STUDIO-088). */}
              <FieldDescription>
                Presencial se ofrece y se paga en Allfit Space. Remoto se cobra solo con un link de
                pago que se manda a cada persona, y ese link todavía no está disponible.
              </FieldDescription>
            </FieldSet>
          </FieldGroup>

          <div data-program-save-bar>
            {unchanged ? (
              <FieldError data-plan-error>
                Ese precio ya es el que está a la venta. Cambia el monto, el cobro o la modalidad
                para publicar otro.
              </FieldError>
            ) : null}
            <Button type="submit" disabled={publish.isPending}>
              Publicar este precio
            </Button>
            <p role="status" aria-live="polite">
              {outcome}
            </p>
          </div>
        </form>

        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            // Closing mid-flight would hide a request that is still going to land.
            if (publish.isPending) return
            setOpen(next)
            if (!next) setFailure(undefined)
          }}
        >
          <AlertDialogContent data-plan-publish-dialog>
            <AlertDialogHeader>
              <AlertDialogTitle>{publishTitle(request)}</AlertDialogTitle>
              <AlertDialogDescription>
                Antes de publicarlo, esto es lo que cambia:
              </AlertDialogDescription>
            </AlertDialogHeader>
            {publishConsequences(plan, request).map((line) => (
              <p key={line}>{line}</p>
            ))}

            {failure ? (
              <Alert variant="danger" live="assertive" data-plan-publish-error>
                <AlertTitle>No se publicó</AlertTitle>
                <AlertDescription>{failure}</AlertDescription>
              </Alert>
            ) : null}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={publish.isPending}>Seguir editando</AlertDialogCancel>
              <AlertDialogAction
                disabled={publish.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  void confirm()
                }}
              >
                {publish.isPending ? <Spinner label="Publicando el precio" /> : null}
                {publish.isPending ? 'Publicando…' : 'Publicar ahora'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

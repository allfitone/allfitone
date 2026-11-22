'use client'

/**
 * Creating a plan: `HU-STUDIO-074`, with its first price when there is one
 * (`HU-STUDIO-075`).
 *
 * A dialog over the plans, as the library creates its own content. The command
 * that creates a plan takes a name and nothing else, and a price is published
 * by a second command, so the dialog offers both ends: the name alone, which
 * leaves a draft nobody can buy, or the name and a price, which is the plan
 * most people came to make.
 *
 * **Two commands cannot fail together.** When the plan is created and its
 * price is then refused, the plan exists: the dialog says so, keeps what was
 * typed, and offers to publish again or to open the draft. Creating it a
 * second time would only answer that the name is taken.
 *
 * Cobros opens it only for a role that may create, so the dialog asks nothing
 * about roles; a role that changed meanwhile is answered by the command.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
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
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { PlanPriceFields, PublishConsequences } from './billing-views'
import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import { planPath } from '@/lib/billing-navigation'
import { createCommandIntentManager } from '@/lib/command-intent'
import { planNameError, planNameRequest, planWriteFailure } from '@/lib/plan-create'
import {
  NEW_PLAN,
  amountError,
  publishConsequences,
  publishRequest,
  publishWriteFailure,
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

const NO_PRICE: PublishDraft = { amount: '', period: 'month', delivery: 'in_person' }

export function PlanCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-library-create="plan">
        <DialogHeader>
          <DialogTitle>Nuevo plan</DialogTitle>
        </DialogHeader>
        {/* Inside the popup, so closing it forgets what was typed. */}
        <PlanCreateForm />
      </DialogContent>
    </Dialog>
  )
}

function PlanCreateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const [name, setName] = useState('')
  const [price, setPrice] = useState<PublishDraft>(NO_PRICE)
  const [command, setCommand] = useState(newCommand)
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  // Which button was pressed: only «Crear y publicar» asks for a price.
  const [asked, setAsked] = useState<'draft' | 'publish' | null>(null)
  const [refusal, setRefusal] = useState<{ status: number } | null>(null)
  // The plan once it exists, while its price is still to be published.
  const [created, setCreated] = useState<OrganizationPlan | null>(null)
  const [publishFailure, setPublishFailure] = useState<string>()

  function refreshPlans(): void {
    void queryClient.invalidateQueries({
      queryKey: studioQueryKeys.organizationPlansRoot(organizationId),
    })
  }

  const create = useStudioSessionMutation({
    mutationFn: ({ body, command }: { body: { name: string }; command: CommandHeaders }, signal) =>
      studioApi.createOrganizationPlan(organizationId, body, command, signal),
    onSuccess: refreshPlans,
  })
  const publish = useStudioSessionMutation({
    mutationFn: (
      {
        planId,
        body,
        command,
      }: { planId: string; body: PlanVersionPublish; command: CommandHeaders },
      signal,
    ) => studioApi.publishOrganizationPlanVersion(organizationId, planId, body, command, signal),
    onSuccess: refreshPlans,
  })

  const busy = create.isPending || publish.isPending
  const request = publishRequest(price)
  const checkedName = asked ? planNameError(name) : undefined
  // Criterion 3: a repeated name is said on the name.
  const nameError = refusal?.status === 409 ? planWriteFailure(409) : checkedName
  const failure = refusal && refusal.status !== 409 ? planWriteFailure(refusal.status) : undefined
  const amountProblem = asked === 'publish' ? amountError(price.amount) : undefined

  function changeName(value: string): void {
    setName(value)
    // A different name is a different command: the old key would replay the first plan.
    setCommand(newCommand())
    setRefusal(null)
  }

  function changePrice(patch: Partial<PublishDraft>): void {
    setPrice((previous) => ({ ...previous, ...patch }))
    setPublishFailure(undefined)
  }

  async function ensurePlan(): Promise<OrganizationPlan | undefined> {
    if (created) return created
    try {
      const plan = await create.mutateAsync({ body: planNameRequest(name), command })
      setCreated(plan)
      return plan
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return undefined
      }
      setRefusal({ status: caught instanceof StudioApiError ? caught.status : 0 })
      return undefined
    }
  }

  async function saveWithoutPrice(): Promise<void> {
    setAsked('draft')
    if (busy || planNameError(name)) return
    setRefusal(null)
    const plan = await ensurePlan()
    // Straight to the plan: its page is where a price is published later.
    if (plan) router.push(planPath(organizationId, plan.plan_id))
  }

  async function createAndPublish(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setAsked('publish')
    if (busy || planNameError(name) || amountError(price.amount)) return
    setRefusal(null)
    setPublishFailure(undefined)
    const plan = await ensurePlan()
    if (!plan) return
    try {
      await publish.mutateAsync({
        planId: plan.plan_id,
        body: request,
        // The same price asked twice is one command; another price is another.
        command: intents.commandFor({
          operation: 'publish-plan-version',
          resourceId: plan.plan_id,
          payload: request,
        }),
      })
      router.push(planPath(organizationId, plan.plan_id))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setPublishFailure(publishWriteFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <form data-studio-form onSubmit={(event) => void createAndPublish(event)} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(nameError)}>
          <FieldLabel htmlFor="plan-name">Nombre</FieldLabel>
          <Input
            id="plan-name"
            name="name"
            maxLength={80}
            value={name}
            onChange={(event) => changeName(event.target.value)}
            aria-invalid={Boolean(nameError)}
            // The plan exists under this name once created; it is renamed on its own page.
            readOnly={created !== null}
            required
          />
          <FieldDescription>
            Como lo verá quien se suscribe, por ejemplo Mensual ilimitado.
          </FieldDescription>
          {nameError ? <FieldError>{nameError}</FieldError> : null}
        </Field>

        <PlanPriceFields draft={price} amountProblem={amountProblem} onChange={changePrice} />
      </FieldGroup>

      <div data-billing-consequences>
        <PublishConsequences draft={price} lines={publishConsequences(NEW_PLAN, request)} />
        <p data-billing-dialog-note>
          Sin precio queda en borrador: nadie puede suscribirse hasta que publiques uno.
        </p>
      </div>

      {failure ? <FieldError data-plan-error>{failure}</FieldError> : null}
      {publishFailure ? (
        <Alert variant="danger" live="assertive" data-plan-publish-error>
          <AlertTitle>El plan se creó, pero su precio no se publicó</AlertTitle>
          <AlertDescription>{publishFailure}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter data-library-create-foot>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void saveWithoutPrice()}
        >
          {created ? 'Abrir el borrador' : 'Guardar sin precio'}
        </Button>
        <Button type="submit" disabled={busy}>
          {publish.isPending
            ? 'Publicando…'
            : create.isPending
              ? 'Creando…'
              : created
                ? 'Publicar el precio'
                : 'Crear y publicar'}
        </Button>
      </DialogFooter>
    </form>
  )
}

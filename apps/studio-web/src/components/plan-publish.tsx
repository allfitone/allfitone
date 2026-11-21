'use client'

/**
 * Putting a price on sale, from the plan's own page: `HU-STUDIO-075`.
 *
 * A dialog that asks the four things the command takes and nothing else
 * (criterion 1). What publishing changes is not something the form asks, so it
 * is said under the fields before the click, and it follows the choices as
 * they are made: the price on sale is retired in the same step, nobody
 * subscribed pays more, a published price is never edited, and a remote price
 * cannot be charged yet. The rules and their wording are in
 * `@/lib/plan-publish`.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import { FieldError, FieldGroup } from '@allfitone/react/components/field'
import { toast } from '@allfitone/react/components/sonner'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'

import { PlanPriceFields, PublishConsequences } from './billing-views'
import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  amountError,
  initialPublishDraft,
  publishConsequences,
  publishOutcome,
  publishRequest,
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

/** What the button that opens the dialog says, and the dialog's own title. */
export function publishActionLabel(plan: OrganizationPlan): string {
  return plan.current_version ? 'Cambiar el precio' : 'Publicar un precio'
}

export function PlanPublishDialog({
  plan,
  organizationId,
  open,
  onOpenChange,
}: {
  plan: OrganizationPlan
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, setPending] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent data-plan-publish-dialog>
        <DialogHeader>
          <DialogTitle>{publishActionLabel(plan)}</DialogTitle>
        </DialogHeader>
        {/* Inside the popup, so closing it forgets what was typed. */}
        <PlanPublishForm
          plan={plan}
          organizationId={organizationId}
          onPendingChange={setPending}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function PlanPublishForm({
  plan,
  organizationId,
  onPendingChange,
  onDone,
}: {
  plan: OrganizationPlan
  organizationId: string
  onPendingChange: (pending: boolean) => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<PublishDraft>(() => initialPublishDraft(plan))
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<string>()

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
    setFailure(undefined)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (publish.isPending || amountError(draft.amount) || sameAsOnSale(plan, request)) return
    setFailure(undefined)
    // The same price confirmed twice is one command; another price is another.
    const command = intents.commandFor({
      operation: 'publish-plan-version',
      resourceId: plan.plan_id,
      payload: request,
    })
    onPendingChange(true)
    try {
      const after = await publish.mutateAsync({ body: request, command })
      intents.reset()
      const changed =
        after.current_version?.plan_version_id !== plan.current_version?.plan_version_id
      const outcome = publishOutcome(plan, after)
      if (changed) toast.success(outcome)
      else toast.info(outcome)
      onPendingChange(false)
      onDone()
    } catch (caught) {
      onPendingChange(false)
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setFailure(publishWriteFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <form data-studio-form onSubmit={(event) => void submit(event)} noValidate>
      <FieldGroup>
        <PlanPriceFields draft={draft} amountProblem={amountProblem} onChange={change} />
      </FieldGroup>

      {/* Criteria 2, 3 and 4, before the click. */}
      <div data-billing-consequences>
        <PublishConsequences draft={draft} lines={publishConsequences(plan, request)} />
      </div>

      {unchanged ? (
        <FieldError data-plan-error>
          Ese precio ya es el que está a la venta. Cambia el monto, el cobro o la modalidad para
          publicar otro.
        </FieldError>
      ) : null}
      {failure ? (
        <Alert variant="danger" live="assertive" data-plan-publish-error>
          <AlertTitle>No se publicó</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter data-library-create-foot>
        <DialogClose
          render={<Button type="button" variant="outline" disabled={publish.isPending} />}
        >
          Cancelar
        </DialogClose>
        <Button type="submit" disabled={publish.isPending}>
          {publish.isPending ? <Spinner label="Publicando el precio" /> : null}
          {publish.isPending ? 'Publicando…' : 'Publicar este precio'}
        </Button>
      </DialogFooter>
    </form>
  )
}

'use client'

/**
 * Taking the price on sale off sale, from the plan's own page: `HU-STUDIO-076`.
 *
 * A plan has one price on sale, so that is the version this retires; the ones
 * before it are already retired. It is asked for from the plan's menu, apart
 * from publishing, because it cannot be undone. The dialog says both criteria
 * before the click, and the answer is said where every answer of the page is.
 * The rules and their wording are in `@/lib/plan-retire`.
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
import { toast } from '@allfitone/react/components/sonner'
import { Spinner } from '@allfitone/react/components/spinner'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useStudioSessionMutation } from './studio-query-provider'
import { createCommandIntentManager } from '@/lib/command-intent'
import {
  retireConsequences,
  retireOutcome,
  retireTitle,
  retireWriteFailure,
} from '@/lib/plan-retire'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type OrganizationPlan,
  type PlanVersion,
} from '@/lib/studio-api'
import { isStudioQuerySessionCancelled, studioQueryKeys } from '@/lib/studio-query'

export function PlanRetireDialog({
  plan,
  version,
  organizationId,
  open,
  onOpenChange,
}: {
  plan: OrganizationPlan
  /** The price on sale when the dialog was asked for. */
  version: PlanVersion
  organizationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [failure, setFailure] = useState<string>()

  const retire = useStudioSessionMutation({
    mutationFn: ({ command }: { command: CommandHeaders }, signal) =>
      studioApi.deprecateOrganizationPlanVersion(
        organizationId,
        plan.plan_id,
        version.plan_version_id,
        command,
        signal,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationPlansRoot(organizationId),
      })
    },
  })

  async function confirm() {
    setFailure(undefined)
    const command = intents.commandFor({
      operation: 'deprecate-plan-version',
      resourceId: version.plan_version_id,
      payload: null,
    })
    try {
      const after = await retire.mutateAsync({ command })
      intents.reset()
      onOpenChange(false)
      const replaced =
        after.current_version !== null &&
        after.current_version.plan_version_id !== version.plan_version_id
      const outcome = retireOutcome(version, after)
      if (replaced) toast.info(outcome)
      else toast.success(outcome)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setFailure(retireWriteFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would hide a request that is still going to land.
        if (retire.isPending) return
        onOpenChange(next)
        if (!next) setFailure(undefined)
      }}
    >
      <AlertDialogContent data-plan-retire-dialog>
        <AlertDialogHeader>
          <AlertDialogTitle>{retireTitle(version)}</AlertDialogTitle>
          <AlertDialogDescription>
            <b>No se puede deshacer:</b> un precio retirado no vuelve a la venta.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Criteria 1 and 2, both halves, before the click. */}
        <ul data-billing-consequence-list>
          {retireConsequences().map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {failure ? (
          <Alert variant="danger" live="assertive" data-plan-retire-error>
            <AlertTitle>No se retiró</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={retire.isPending}>Mantenerlo a la venta</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={retire.isPending}
            onClick={(event) => {
              event.preventDefault()
              void confirm()
            }}
          >
            {retire.isPending ? <Spinner label="Retirando el precio" /> : null}
            {retire.isPending ? 'Retirando…' : 'Retirar ahora'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

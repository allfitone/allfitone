'use client'

/**
 * Taking the price on sale off sale, from the plan's own page: `HU-STUDIO-076`.
 *
 * A plan has one price on sale, so that is the version this card retires; the
 * ones before it are already retired. The dialog says both criteria before the
 * click, and the card stays after it, so the result is announced where the
 * button was. The rules and their wording are in `@/lib/plan-retire`.
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

export function PlanRetire({
  plan,
  organizationId,
}: {
  plan: OrganizationPlan
  organizationId: string
}) {
  const queryClient = useQueryClient()
  const [intents] = useState(() => createCommandIntentManager(newCommand))
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [outcome, setOutcome] = useState('')
  const current = plan.current_version

  const retire = useStudioSessionMutation({
    mutationFn: ({ version, command }: { version: PlanVersion; command: CommandHeaders }, signal) =>
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

  // A draft has never had a price, so there is nothing to retire.
  if (plan.versions.length === 0) return null

  async function confirm(version: PlanVersion) {
    setFailure(undefined)
    const command = intents.commandFor({
      operation: 'deprecate-plan-version',
      resourceId: version.plan_version_id,
      payload: null,
    })
    try {
      const after = await retire.mutateAsync({ version, command })
      intents.reset()
      setOpen(false)
      setOutcome(retireOutcome(version, after))
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        intents.reset()
        return
      }
      setFailure(retireWriteFailure(caught instanceof StudioApiError ? caught.status : 0))
    }
  }

  return (
    <Card data-plan-retire>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Retirar el precio a la venta
        </CardTitle>
        <CardDescription>
          {current
            ? 'Nadie más podrá suscribirse a él. Quien ya lo paga lo conserva: no se cancela, no se suspende y no cambia de plan a nadie.'
            : 'Ahora no tiene ningún precio a la venta. Para volver a venderlo, publica uno.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {current ? (
          <AlertDialog
            open={open}
            onOpenChange={(next) => {
              // Closing mid-flight would hide a request that is still going to land.
              if (retire.isPending) return
              setOpen(next)
              if (!next) setFailure(undefined)
            }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOutcome('')
                setOpen(true)
              }}
            >
              Retirar este precio
            </Button>

            <AlertDialogContent data-plan-retire-dialog>
              <AlertDialogHeader>
                <AlertDialogTitle>{retireTitle(current)}</AlertDialogTitle>
                <AlertDialogDescription>
                  <b>No se puede deshacer:</b> un precio retirado no vuelve a la venta.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {/* Criteria 1 and 2, both halves, before the click. */}
              {retireConsequences().map((line) => (
                <p key={line}>{line}</p>
              ))}

              {failure ? (
                <Alert variant="danger" live="assertive" data-plan-retire-error>
                  <AlertTitle>No se retiró</AlertTitle>
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              ) : null}

              <AlertDialogFooter>
                <AlertDialogCancel disabled={retire.isPending}>
                  Mantenerlo a la venta
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={retire.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    void confirm(current)
                  }}
                >
                  {retire.isPending ? <Spinner label="Retirando el precio" /> : null}
                  {retire.isPending ? 'Retirando…' : 'Retirar ahora'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <p role="status" aria-live="polite">
          {outcome}
        </p>
      </CardContent>
    </Card>
  )
}

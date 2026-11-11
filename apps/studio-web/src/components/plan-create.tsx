'use client'

/**
 * Creating a plan: `HU-STUDIO-074`.
 *
 * One question, because the command asks one: the price is published on the
 * plan's own page once it exists (`HU-STUDIO-075`). Built on the program form's
 * register, with the capability read first so the screen says no instead of
 * letting the command answer `403`.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import {
  SetupPanel,
  SetupPanelActions,
  SetupPanelContent,
  SetupPanelDescription,
  SetupPanelEyebrow,
  SetupPanelIntro,
  SetupPanelTitle,
} from '@allfitone/react/components/setup-shell'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { useStudioSessionMutation } from './studio-query-provider'
import { canManageBilling } from '@/lib/organization-billing'
import { planNameError, planNameRequest, planWriteFailure } from '@/lib/plan-create'
import { StudioApiError, newCommand, studioApi, type CommandHeaders } from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

export function PlanCreateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const billingPath = `/organizations/${organizationId}/billing`
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const [name, setName] = useState('')
  const [command, setCommand] = useState(newCommand)
  const [submitted, setSubmitted] = useState(false)
  const [refusal, setRefusal] = useState<{ status: number } | null>(null)

  const create = useStudioSessionMutation({
    mutationFn: ({ body, command }: { body: { name: string }; command: CommandHeaders }, signal) =>
      studioApi.createOrganizationPlan(organizationId, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationPlansRoot(organizationId),
      })
    },
  })

  const allowed = canManageBilling(current.roles, rolesQuery.data?.items)
  const checked = submitted ? planNameError(name) : undefined
  // Criterion 3: a repeated name is said on the name.
  const nameError = refusal?.status === 409 ? planWriteFailure(409) : checked
  const failure = refusal && refusal.status !== 409 ? planWriteFailure(refusal.status) : undefined

  if (rolesQuery.isPending) return null

  if (!allowed) {
    return (
      <section data-program-create-refusal>
        <Alert variant="warning" live="polite">
          <AlertTitle>Tu rol no crea planes</AlertTitle>
          <AlertDescription>
            Crear planes corresponde a quienes administran los cobros de {current.display_name}:
            propietario y administración.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.replace(billingPath)}>
          Volver a Cobros
        </Button>
      </section>
    )
  }

  function change(value: string) {
    setName(value)
    // A different name is a different command: the old key would replay the first plan.
    setCommand(newCommand())
    setRefusal(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (create.isPending || planNameError(name)) return
    setRefusal(null)
    try {
      const plan = await create.mutateAsync({ body: planNameRequest(name), command })
      router.replace(`${billingPath}/plans/${plan.plan_id}`)
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setRefusal({ status: caught instanceof StudioApiError ? caught.status : 0 })
    }
  }

  return (
    <SetupPanel>
      <SetupPanelIntro>
        <SetupPanelEyebrow>Cobros</SetupPanelEyebrow>
        <SetupPanelTitle as="h2">Crea un plan.</SetupPanelTitle>
        {/* Criteria 1 and 2, before the click. */}
        <SetupPanelDescription>
          Primero tiene un nombre. El precio se publica después, en el propio plan, y hasta entonces
          nadie puede suscribirse.
        </SetupPanelDescription>
      </SetupPanelIntro>

      <SetupPanelContent>
        <form data-studio-form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="plan-name">Nombre</FieldLabel>
              <Input
                id="plan-name"
                name="name"
                maxLength={80}
                value={name}
                onChange={(event) => change(event.target.value)}
                aria-invalid={Boolean(nameError)}
                required
              />
              <FieldDescription>
                Como lo verá quien se suscribe, por ejemplo Mensual ilimitado. Único en tu
                organización, sin contar mayúsculas.
              </FieldDescription>
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>
          </FieldGroup>

          {failure ? <FieldError data-plan-error>{failure}</FieldError> : null}

          <SetupPanelActions>
            <Button type="submit" size="lg" disabled={create.isPending}>
              {create.isPending ? 'Creando…' : 'Crear plan'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={create.isPending}
              onClick={() => router.replace(billingPath)}
            >
              Cancelar
            </Button>
          </SetupPanelActions>
        </form>
      </SetupPanelContent>
    </SetupPanel>
  )
}

'use client'

/**
 * One plan, on its own page: what it is, every price it has had, and what an
 * owner or an admin can do with it.
 *
 * There is no read of one plan: the listing carries each plan whole, so the
 * page finds its plan there, the way the program editor finds its draft. The
 * whole team reads it (`HU-STUDIO-077`); writing is `manage_billing`'s, so a
 * coach or staff member reads the same page without its forms.
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@allfitone/react/components/field'
import { Input } from '@allfitone/react/components/input'
import { Spinner } from '@allfitone/react/components/spinner'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { PlanPublish } from './plan-publish'
import { PlanRetire } from './plan-retire'
import { useStudioSessionMutation } from './studio-query-provider'
import { WorkspacePageHeader } from './workspace-page-header'
import { canManageBilling } from '@/lib/organization-billing'
import { planStateLine, planVersionLine, versionStatusLabel } from '@/lib/plan-catalog'
import { planNameError, planNameRequest, planWriteFailure } from '@/lib/plan-create'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type OrganizationPlan,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationPlansQueryOptions,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'

const PAGE_SIZE = 50

export function PlanDetail() {
  const params = useParams<{ planId: string }>()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const billingPath = `/organizations/${organizationId}/billing`
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const plansQuery = useInfiniteQuery(organizationPlansQueryOptions(organizationId, PAGE_SIZE))
  const plan = plansQuery.data?.pages
    .flatMap((page) => page.data)
    .find((candidate) => candidate.plan_id === params.planId)
  const searching = !plan && plansQuery.hasNextPage

  useEffect(() => {
    if (searching && !plansQuery.isFetchingNextPage) void plansQuery.fetchNextPage()
  }, [searching, plansQuery])

  const canManage = canManageBilling(current.roles, rolesQuery.data?.items)
  const label = 'Plan'

  if (!plan && plansQuery.isSuccess && !plansQuery.hasNextPage) {
    return (
      <section data-billing-page aria-label={label}>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="overview" decorative />
            </EmptyMedia>
            <EmptyTitle>No encontramos este plan</EmptyTitle>
            <EmptyDescription>
              No existe o no es de {current.display_name}. Vuelve a Cobros para elegir otro.
            </EmptyDescription>
          </EmptyHeader>
          <BackToBilling href={billingPath} />
        </Empty>
      </section>
    )
  }

  if (plansQuery.isError) {
    return (
      <section data-billing-page aria-label={label}>
        <Alert variant="danger" live="polite">
          <AlertTitle>No pudimos abrir el plan</AlertTitle>
          <AlertDescription>
            La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" onClick={() => void plansQuery.refetch()}>
              Reintentar
            </Button>
          </AlertAction>
        </Alert>
      </section>
    )
  }

  if (!plan || rolesQuery.isPending) {
    return (
      <section data-billing-page aria-label={label}>
        <div data-content-catalog-state>
          <Spinner label="Abriendo el plan" />
          <p>Abriendo el plan…</p>
        </div>
      </section>
    )
  }

  return (
    <section data-billing-page aria-label={label}>
      <WorkspacePageHeader
        description={`Un plan que vende ${current.display_name}: su nombre, y cada precio que ha tenido.`}
        actions={<BackToBilling href={billingPath} />}
      />
      <PlanSummary plan={plan} />
      {canManage ? (
        <>
          <PlanPublish
            key={`publish-${plan.plan_id}`}
            plan={plan}
            organizationId={organizationId}
          />
          <PlanRetire key={`retire-${plan.plan_id}`} plan={plan} organizationId={organizationId} />
          <PlanRename key={plan.plan_id} plan={plan} organizationId={organizationId} />
        </>
      ) : (
        <p>Cambiar un plan corresponde a quienes administran los cobros.</p>
      )}
    </section>
  )
}

function PlanSummary({ plan }: { plan: OrganizationPlan }) {
  return (
    <Card data-plan-summary>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {plan.name}
        </CardTitle>
        <CardDescription>{planStateLine(plan)}</CardDescription>
      </CardHeader>
      <CardContent>
        {plan.versions.length > 0 ? (
          <ul data-content-version-list aria-label="Precios">
            {plan.versions.map((version) => (
              <li key={version.plan_version_id}>
                <span>{planVersionLine(version)}</span>
                <Badge variant={version.status === 'published' ? 'secondary' : 'outline'}>
                  {versionStatusLabel(version)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p>Todavía no tiene ningún precio publicado.</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * `OP-PAY-003`. The name of a draft and of a plan on sale change alike, and
 * whoever pays it reads the new one. A name another plan uses is a `409`.
 */
function PlanRename({ plan, organizationId }: { plan: OrganizationPlan; organizationId: string }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(plan.name)
  const [command, setCommand] = useState(newCommand)
  const [submitted, setSubmitted] = useState(false)
  const [refusal, setRefusal] = useState<{ status: number } | null>(null)
  const [saved, setSaved] = useState(false)

  const rename = useStudioSessionMutation({
    mutationFn: ({ body, command }: { body: { name: string }; command: CommandHeaders }, signal) =>
      studioApi.renameOrganizationPlan(organizationId, plan.plan_id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationPlansRoot(organizationId),
      })
    },
  })

  const checked = submitted ? planNameError(name) : undefined
  const nameError = refusal?.status === 409 ? planWriteFailure(409) : checked
  const failure = refusal && refusal.status !== 409 ? planWriteFailure(refusal.status) : undefined

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (rename.isPending || planNameError(name)) return
    setRefusal(null)
    try {
      await rename.mutateAsync({ body: planNameRequest(name), command })
      setSaved(true)
      setSubmitted(false)
      setCommand(newCommand())
    } catch (caught) {
      if (isStudioQuerySessionCancelled(caught)) {
        setCommand(newCommand())
        return
      }
      setRefusal({ status: caught instanceof StudioApiError ? caught.status : 0 })
    }
  }

  return (
    <Card data-plan-rename>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Nombre del plan
        </CardTitle>
        <CardDescription>
          Se puede cambiar esté o no a la venta. Quien ya lo paga ve el nombre nuevo; su precio no
          cambia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form data-studio-form onSubmit={submit} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(nameError)}>
              <FieldLabel htmlFor="plan-rename">Nombre</FieldLabel>
              <Input
                id="plan-rename"
                maxLength={80}
                value={name}
                aria-invalid={Boolean(nameError)}
                onChange={(event) => {
                  setName(event.target.value)
                  setCommand(newCommand())
                  setRefusal(null)
                  setSaved(false)
                }}
              />
              <FieldDescription>Único en tu organización, sin contar mayúsculas.</FieldDescription>
              {nameError ? <FieldError>{nameError}</FieldError> : null}
            </Field>
          </FieldGroup>
          <div data-program-save-bar>
            {failure ? <FieldError data-plan-error>{failure}</FieldError> : null}
            <Button type="submit" variant="outline" disabled={rename.isPending}>
              {rename.isPending ? <Spinner label="Guardando el nombre" /> : null}
              {rename.isPending ? 'Guardando…' : 'Guardar el nombre'}
            </Button>
            <p role="status" aria-live="polite">
              {saved ? 'Nombre guardado.' : ''}
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function BackToBilling({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={buttonVariants({ variant: 'outline' })}
      data-variant="outline"
      data-slot="button"
    >
      Volver a Cobros
    </Link>
  )
}

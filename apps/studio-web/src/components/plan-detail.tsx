'use client'

/**
 * One plan, on its own page: what it sells at, every price it has had, and
 * what an owner or an admin can do with it.
 *
 * Shaped as the library's editors are: a trail back to the plans, then a bar
 * that stays in sight with the name typed where it is read, the state beside
 * it and the actions. Publishing a price is the button; retiring the one on
 * sale cannot be undone, so it waits in the menu.
 *
 * There is no read of one plan: the listing carries each plan whole, so the
 * page finds its plan there, the way the program editor finds its draft. The
 * whole team reads it (`HU-STUDIO-077`); writing is `manage_billing`'s, so a
 * coach or staff member reads the same page with a name that is not a field
 * and no actions.
 *
 * `OP-PAY-003`: the name of a draft and of a plan on sale change alike, and
 * whoever pays it reads the new one, so a change waits for «Guardar el nombre»
 * instead of saving itself. A name another plan uses is a `409`.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button, buttonVariants } from '@allfitone/react/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { FieldError } from '@allfitone/react/components/field'
import { IconButton } from '@allfitone/react/components/icon-button'
import { Input } from '@allfitone/react/components/input'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { Spinner } from '@allfitone/react/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { type FormEvent, useEffect, useId, useState } from 'react'

import { BillingTrail, PlanStateBadge } from './billing-views'
import { LibraryToaster } from './library-views'
import { useOrganizationContext } from './organization-context'
import { PlanPublishDialog, publishActionLabel } from './plan-publish'
import { PlanRetireDialog } from './plan-retire'
import { useStudioSessionMutation } from './studio-query-provider'
import { billingPath } from '@/lib/billing-navigation'
import { canManageBilling } from '@/lib/organization-billing'
import {
  deliveryName,
  planPriceLine,
  planState,
  planStateLabel,
  planStateNote,
  planVersionLine,
  priceLabel,
  versionSpan,
  versionStatusLabel,
} from '@/lib/plan-catalog'
import { planNameError, planNameRequest, planWriteFailure } from '@/lib/plan-create'
import {
  StudioApiError,
  newCommand,
  studioApi,
  type CommandHeaders,
  type OrganizationPlan,
  type PlanVersion,
} from '@/lib/studio-api'
import {
  isStudioQuerySessionCancelled,
  organizationPlansQueryOptions,
  organizationRolesQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'

const PAGE_SIZE = 50
const RENAME_FORM = 'plan-rename-form'

export function PlanDetail() {
  const params = useParams<{ planId: string }>()
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
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
          <Link
            href={billingPath(organizationId, 'plans')}
            className={buttonVariants({ variant: 'outline' })}
            data-variant="outline"
            data-slot="button"
          >
            Volver a Cobros
          </Link>
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
        <div data-editor-skeleton role="status" aria-label="Abriendo el plan">
          <Skeleton data-editor-skeleton-bar />
          <Skeleton data-plan-skeleton-block />
        </div>
      </section>
    )
  }

  return (
    <section data-billing-page aria-label={label}>
      <BillingTrail organizationId={organizationId} current={plan.name} />

      {canManage ? (
        <PlanBar key={plan.plan_id} plan={plan} organizationId={organizationId} />
      ) : (
        <header data-editor-bar>
          <div data-editor-title>
            <p role="heading" aria-level={2} data-editor-heading>
              {plan.name}
            </p>
            <PlanStateBadge plan={plan} />
          </div>
        </header>
      )}

      <PlanSummary plan={plan} />

      {canManage ? null : (
        <p data-editor-meta-note>Cambiar un plan corresponde a quienes administran los cobros.</p>
      )}
      {/* Last, so the room the section keeps between its parts falls under them. */}
      <LibraryToaster />
    </section>
  )
}

/** The bar of a plan somebody may change: its name as a field, and what a price can be asked to do. */
function PlanBar({ plan, organizationId }: { plan: OrganizationPlan; organizationId: string }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(plan.name)
  const [command, setCommand] = useState(newCommand)
  const [submitted, setSubmitted] = useState(false)
  const [refusal, setRefusal] = useState<{ status: number } | null>(null)
  const [saved, setSaved] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // The price the menu was asked to retire: kept while its dialog closes.
  const [retiring, setRetiring] = useState<PlanVersion | null>(null)
  const [retireOpen, setRetireOpen] = useState(false)

  const rename = useStudioSessionMutation({
    mutationFn: ({ body, command }: { body: { name: string }; command: CommandHeaders }, signal) =>
      studioApi.renameOrganizationPlan(organizationId, plan.plan_id, body, command, signal),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationPlansRoot(organizationId),
      })
    },
  })

  const dirty = name.trim() !== plan.name
  const checked = submitted ? planNameError(name) : undefined
  const nameError = refusal?.status === 409 ? planWriteFailure(409) : checked
  const failure = refusal && refusal.status !== 409 ? planWriteFailure(refusal.status) : undefined
  const onSale = plan.on_sale ? plan.current_version : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (rename.isPending || !dirty || planNameError(name)) return
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
    <>
      {/* Stays in sight while the prices scroll, like every editor of the library. */}
      <header data-editor-bar>
        <form
          id={RENAME_FORM}
          data-editor-title
          onSubmit={(event) => void submit(event)}
          noValidate
        >
          <Input
            aria-label="Nombre"
            placeholder="Nombre del plan"
            maxLength={80}
            value={name}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => {
              setName(event.target.value)
              // A different name is a different command.
              setCommand(newCommand())
              setRefusal(null)
              setSaved(false)
            }}
            data-editor-name
          />
          <PlanStateBadge plan={plan} />
        </form>
        <div data-editor-actions>
          <p data-plan-save-status role="status" aria-live="polite">
            {saved && !dirty ? 'Nombre guardado.' : ''}
          </p>
          {/* Offered only once the name differs: nothing to save is no button. */}
          {dirty ? (
            <Button type="submit" form={RENAME_FORM} disabled={rename.isPending}>
              {rename.isPending ? <Spinner label="Guardando el nombre" /> : null}
              {rename.isPending ? 'Guardando…' : 'Guardar el nombre'}
            </Button>
          ) : null}
          {/* One of the two is the next thing to do, and that one is the filled button. */}
          <Button
            type="button"
            variant={dirty ? 'outline' : 'default'}
            onClick={() => setPublishing(true)}
            data-plan-publish-action
          >
            {publishActionLabel(plan)}
          </Button>
          {onSale ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Más acciones de ${plan.name}`}
                    data-plan-menu
                  />
                }
              >
                <FoundationIcon name="more" decorative />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-billing-menu-content>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setRetiring(onSale)
                      setRetireOpen(true)
                    }}
                    data-plan-retire-action
                  >
                    Retirar el precio
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      {/* What stops a save is said under the button that was pressed. */}
      {nameError ? <FieldError data-plan-error>{nameError}</FieldError> : null}
      {failure ? <FieldError data-plan-error>{failure}</FieldError> : null}

      <PlanPublishDialog
        plan={plan}
        organizationId={organizationId}
        open={publishing}
        onOpenChange={setPublishing}
      />
      {retiring ? (
        <PlanRetireDialog
          plan={plan}
          version={retiring}
          organizationId={organizationId}
          open={retireOpen}
          onOpenChange={setRetireOpen}
        />
      ) : null}
    </>
  )
}

// What it sells at now is the answer most readers came for: said large, before the list.
function PlanSummary({ plan }: { plan: OrganizationPlan }) {
  const state = planState(plan)
  const note = planStateNote(plan)
  const offerId = useId()
  const pricesId = useId()
  return (
    <div data-plan-summary>
      <section aria-labelledby={offerId} data-plan-offer={state}>
        <h2 id={offerId} data-plan-section-title>
          {planStateLabel(state)}
        </h2>
        {note ? (
          <p data-plan-offer-note>{note}</p>
        ) : (
          <p data-plan-offer-price>{planPriceLine(plan)}</p>
        )}
      </section>

      {plan.versions.length > 0 ? (
        <section aria-labelledby={pricesId} data-plan-prices>
          <h2 id={pricesId} data-plan-section-title>
            Precios
          </h2>
          <PlanPrices versions={plan.versions} />
        </section>
      ) : null}
    </div>
  )
}

function PlanPrices({ versions }: { versions: readonly PlanVersion[] }) {
  const { compact, measuredRef } = useCompactTable<HTMLDivElement>()
  return (
    <div ref={measuredRef} data-plan-price-register>
      {compact ? (
        // Only one presentation is rendered: see useCompactTable.
        <ul data-plan-price-list aria-label="Precios">
          {versions.map((version) => (
            <li key={version.plan_version_id}>
              <span data-plan-price-line>{planVersionLine(version)}</span>
              <span data-plan-price-span>{versionSpan(version)}</span>
              <span data-plan-price-state>
                <VersionBadge version={version} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Table
          aria-label="Precios"
          scrollAreaLabel="Tabla de precios del plan"
          data-studio-register="plan-prices"
        >
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Versión</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Modalidad</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.plan_version_id} data-plan-price-row>
                <TableCell>Versión {version.version_number}</TableCell>
                <TableCell>{priceLabel(version)}</TableCell>
                <TableCell>{deliveryName(version.delivery_mode)}</TableCell>
                <TableCell>{versionSpan(version)}</TableCell>
                <TableCell>
                  <VersionBadge version={version} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function VersionBadge({ version }: { version: PlanVersion }) {
  return (
    <Badge variant={version.status === 'published' ? 'success' : 'outline'}>
      {versionStatusLabel(version)}
    </Badge>
  )
}

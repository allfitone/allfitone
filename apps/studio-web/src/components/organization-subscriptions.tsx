'use client'

/**
 * Who pays the organization, and the three things it can do about it.
 *
 * `HU-STUDIO-078`, criterion by criterion: (1) the state of each plan, counted
 * over the list and filtered in it; (2) the tab only `manage_billing` sees;
 * (3) no training data, pinned by a test on the columns; (4) the first payment
 * and why each one was suspended need Mercado Pago, and
 * `OrganizationSubscription` has no field for either yet.
 *
 * Three rules worth knowing before editing.
 *
 * **Pausing is not revoking.** The command opens a reversible cause and touches
 * no permission, no assignment and no relationship. Every confirmation says so,
 * and those sentences are the behaviour rather than decoration: an
 * administrator who believes pausing takes the client's data away will either
 * avoid the action or use it thinking it does something it does not.
 *
 * **`manage_billing` or nothing.** A coach with that client assigned reads the
 * same answer as a stranger — the payment state of a person is not a training
 * fact — so the Cobros page shows this tab only to whoever holds the
 * capability, and PostgreSQL closes it again underneath.
 *
 * **The list is read whole before anything is shown.** The read answers no
 * totals and takes no search, so the figures over the list, the counts on the
 * filter and the search are all worked out here, and each is true only of the
 * whole list. A page that fails therefore shows the failure and not what did
 * arrive: half a list would count half the people.
 *
 * The list is never held long. The catalogue says it is "nunca cacheable para
 * decidir suspensión", and the reason is concrete: suspending on a stale row is
 * how somebody loses access over a charge that already cleared.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Avatar, AvatarFallback } from '@allfitone/react/components/avatar'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import { Card, CardAction, CardFooter, CardHeader } from '@allfitone/react/components/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@allfitone/react/components/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@allfitone/react/components/dropdown-menu'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { IconButton } from '@allfitone/react/components/icon-button'
import { Input } from '@allfitone/react/components/input'
import { Skeleton } from '@allfitone/react/components/skeleton'
import { toast } from '@allfitone/react/components/sonner'
import { Spinner } from '@allfitone/react/components/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@allfitone/react/components/table'
import { ToggleGroup, ToggleGroupItem } from '@allfitone/react/components/toggle-group'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useOrganizationContext } from './organization-context'
import { RegisterCardState } from './register-card-state'
import {
  NO_SUBSCRIPTION_FILTERS,
  actionLabel,
  availableActions,
  billingSummary,
  canManageBilling,
  confirmationDescription,
  confirmationSections,
  confirmationTitle,
  filterSubscriptions,
  formatAmount,
  formatPeriod,
  menuActionLabel,
  personInitials,
  refusalDescription,
  refusalFor,
  refusalTitle,
  statusLabel,
  subscriptionDateLine,
  transitionDone,
  type BillingRefusal,
  type BillingSummary,
  type SubscriptionAction,
  type SubscriptionFilters,
  type SubscriptionStateFilter,
} from '@/lib/organization-billing'
import { StudioApiError, newCommand, studioApi } from '@/lib/studio-api'
import type { OrganizationSubscription } from '@/lib/studio-api'
import {
  flattenSubscriptionPages,
  isStudioForbidden,
  organizationRolesQueryOptions,
  organizationSubscriptionsQueryOptions,
  studioQueryKeys,
} from '@/lib/studio-query'
import { useCompactTable } from '@/lib/use-compact-table'
import { useEveryPage } from '@/lib/use-every-page'

// The most the read gives at once: the list is read whole, so fewer, larger pages.
const PAGE_SIZE = 100
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5]
const BILLING_NOTE =
  'El cobro lo administra esta organización en su propia pasarela. Allfit One refleja el estado del pago y nunca guarda datos de tarjeta.'

interface PendingAction {
  action: SubscriptionAction
  subscription: OrganizationSubscription
}

export function OrganizationSubscriptions() {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const { compact, measuredRef } = useCompactTable<HTMLElement>()
  const queryClient = useQueryClient()
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const canManage = canManageBilling(current.roles, rolesQuery.data?.items)
  const [filters, setFilters] = useState<SubscriptionFilters>(NO_SUBSCRIPTION_FILTERS)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [refusal, setRefusal] = useState<BillingRefusal | null>(null)

  const options = organizationSubscriptionsQueryOptions(organizationId, 'all', PAGE_SIZE)
  const query = useInfiniteQuery({ ...options, enabled: canManage })
  useEveryPage(query)

  const transition = useMutation({
    mutationFn: ({ action, subscription }: PendingAction) => {
      const command = newCommand()
      const subscriptionId = subscription.subscription_id
      if (action === 'suspend') {
        return studioApi.suspendSubscription(organizationId, subscriptionId, command)
      }
      if (action === 'reactivate') {
        return studioApi.reactivateSubscription(organizationId, subscriptionId, command)
      }
      return studioApi.endSubscription(organizationId, subscriptionId, command)
    },
    onSuccess: async (_answer, { action, subscription }) => {
      setRefusal(null)
      setPending(null)
      toast.success(transitionDone(action, subscription.person_name))
      // The whole subtree: the organization's own page reads this list too.
      await queryClient.invalidateQueries({
        queryKey: studioQueryKeys.organizationSubscriptionsRoot(organizationId),
      })
    },
    onError: (cause) => {
      setRefusal(refusalFor(cause instanceof StudioApiError ? cause.status : undefined))
    },
  })

  async function retry(): Promise<void> {
    // A cursor the list outgrew cannot be asked again: the read starts over.
    if (query.isFetchNextPageError) {
      await queryClient.resetQueries({ queryKey: options.queryKey, exact: true })
      return
    }
    await query.refetch()
  }

  function ask(action: SubscriptionAction, subscription: OrganizationSubscription): void {
    setRefusal(null)
    setPending({ action, subscription })
  }

  if (query.isError) {
    // Said the way every register says a failed read, at any width.
    return (
      <section data-billing-panel aria-label="Suscripciones">
        {isStudioForbidden(query.error) ? (
          <RegisterCardState
            state="error"
            title="No tienes acceso a los cobros"
            description="La organización o tus permisos ya no permiten consultar esta información."
          />
        ) : (
          <RegisterCardState
            state="error"
            title="No pudimos cargar los cobros"
            description="La conexión falló de forma temporal. Inténtalo de nuevo."
            action={
              <Button size="sm" variant="outline" onClick={() => void retry()}>
                Reintentar
              </Button>
            }
          />
        )}
      </section>
    )
  }

  if (rolesQuery.isPending || (canManage && (query.isPending || query.hasNextPage))) {
    return (
      <section data-billing-panel aria-label="Suscripciones">
        <SubscriptionsSkeleton />
      </section>
    )
  }

  const items = flattenSubscriptionPages(query.data)

  if (items.length === 0) {
    return (
      <section data-billing-panel aria-label="Suscripciones">
        {/* Says where the next step is, and it is not here: a person subscribes
            from Space, because nobody can agree to a price for them. */}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="business" decorative />
            </EmptyMedia>
            <EmptyTitle>Todavía nadie paga aquí</EmptyTitle>
            <EmptyDescription>
              Las personas se suscriben desde la app, eligiendo uno de los planes publicados de la
              organización. Aquí verás cada plan en cuanto alguien lo tome.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <p data-billing-note>{BILLING_NOTE}</p>
      </section>
    )
  }

  const summary = billingSummary(items)
  const shown = filterSubscriptions(items, filters)
  const states: ReadonlyArray<{ value: SubscriptionStateFilter; label: string; count: number }> = [
    { value: 'all', label: 'Todas', count: items.length },
    { value: 'active', label: 'Al día', count: summary.active },
    { value: 'suspended', label: 'En pausa', count: summary.suspended },
    { value: 'ended', label: 'Terminadas', count: summary.ended },
  ]

  function chooseState(values: SubscriptionStateFilter[]): void {
    const next = values[0]
    // Pressing the state already on leaves it on: the list always shows one.
    if (next && next !== filters.status) setFilters({ ...filters, status: next })
  }

  return (
    <section ref={measuredRef} data-billing-panel aria-label="Suscripciones">
      <SummaryFigures summary={summary} />

      <div data-billing-toolbar>
        <Input
          type="search"
          name="q"
          autoComplete="off"
          aria-label="Buscar persona"
          placeholder="Buscar persona…"
          value={filters.term}
          onChange={(event) => setFilters({ ...filters, term: event.target.value })}
          data-billing-search
        />
        <ToggleGroup
          value={[filters.status]}
          onValueChange={chooseState}
          aria-label="Filtrar suscripciones por estado"
          data-billing-filter
        >
          {states.map((state) => (
            <ToggleGroupItem key={state.value} value={state.value}>
              {state.label}
              <span data-billing-count>{state.count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {query.isFetching ? (
        <p data-query-refreshing role="status" aria-live="polite">
          Actualizando cobros…
        </p>
      ) : null}

      {shown.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FoundationIcon name="search" decorative />
            </EmptyMedia>
            <EmptyTitle>{noMatchTitle(filters)}</EmptyTitle>
            <EmptyDescription>{noMatchDescription(filters)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setFilters(NO_SUBSCRIPTION_FILTERS)}>
              Quitar los filtros
            </Button>
          </EmptyContent>
        </Empty>
      ) : compact ? (
        // Only one presentation is rendered: see useCompactTable.
        <ul data-billing-card-list aria-label="Suscripciones">
          {shown.map((subscription) => (
            <li key={subscription.subscription_id}>
              <SubscriptionCard subscription={subscription} onAct={ask} />
            </li>
          ))}
        </ul>
      ) : (
        <Table
          aria-label="Suscripciones"
          scrollAreaLabel="Tabla de suscripciones de la organización"
          data-studio-register="subscriptions"
        >
          {/* Filtering must not move the columns under the reader. */}
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cobro</TableHead>
              <TableHead aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((subscription) => (
              <SubscriptionRow
                key={subscription.subscription_id}
                subscription={subscription}
                onAct={ask}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <p data-billing-note>{BILLING_NOTE}</p>

      <Dialog
        open={pending !== null}
        onOpenChange={(next) => {
          // Closing mid-flight would hide a request that is still going to land, and the
          // person has already been emailed by the time it does.
          if (transition.isPending) return
          if (!next) {
            setPending(null)
            setRefusal(null)
          }
        }}
      >
        <DialogContent data-billing-confirm>
          {pending ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmationTitle(pending.action, pending.subscription.person_name)}
                </DialogTitle>
                <DialogDescription>{confirmationDescription(pending.action)}</DialogDescription>
              </DialogHeader>
              <Consequences action={pending.action} status={pending.subscription.status} />

              {refusal ? (
                <Alert variant="danger" live="assertive" data-billing-error>
                  <AlertTitle>{refusalTitle(pending.action, refusal)}</AlertTitle>
                  <AlertDescription>{refusalDescription(pending.action, refusal)}</AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="ghost" disabled={transition.isPending} />}
                >
                  Cancelar
                </DialogClose>
                <Button
                  type="button"
                  variant={pending.action === 'end' ? 'destructive' : 'default'}
                  disabled={transition.isPending}
                  onClick={() => transition.mutate(pending)}
                >
                  {transition.isPending ? (
                    <Spinner label={`${actionLabel(pending.action)} el plan`} />
                  ) : null}
                  {transition.isPending ? 'Aplicando…' : `${actionLabel(pending.action)} y avisar`}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

/**
 * How many stand in each state and what the active plans add up to in a month.
 * They follow the list, never the filter: narrowing rows changes no total.
 */
function SummaryFigures({ summary }: { summary: BillingSummary }) {
  return (
    <dl data-billing-summary>
      <Figure name="active" label="Al día" value={summary.active} />
      <Figure name="suspended" label="En pausa" value={summary.suspended} />
      <Figure name="ended" label="Terminadas" value={summary.ended} />
      {summary.monthly ? (
        <Figure
          name="monthly"
          label="Suman al mes"
          value={formatAmount(summary.monthly.amountMinor, summary.monthly.currencyCode)}
        />
      ) : null}
    </dl>
  )
}

function Figure({ name, label, value }: { name: string; label: string; value: number | string }) {
  return (
    <div data-billing-figure={name}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/**
 * What the action does and what it leaves alone, under a heading each: the
 * second half is what nobody would guess, and what makes the action safe.
 */
function Consequences({
  action,
  status,
}: {
  action: SubscriptionAction
  status: OrganizationSubscription['status']
}) {
  const { happens, stays, notice } = confirmationSections(action, status)
  const happensId = useId()
  const staysId = useId()
  return (
    <div data-billing-consequences>
      <section aria-labelledby={happensId} data-billing-consequence="happens">
        <h3 id={happensId}>Qué pasa</h3>
        <ul>
          {happens.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section aria-labelledby={staysId} data-billing-consequence="stays">
        <h3 id={staysId}>Qué no cambia</h3>
        <ul>
          {stays.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <p data-billing-notice>{notice}</p>
    </div>
  )
}

interface SubscriptionEntryProps {
  subscription: OrganizationSubscription
  onAct: (action: SubscriptionAction, subscription: OrganizationSubscription) => void
}

function SubscriptionRow({ subscription, onAct }: SubscriptionEntryProps) {
  return (
    <TableRow data-billing-row>
      <TableCell>
        <span data-billing-person>
          <Avatar decorative>
            <AvatarFallback>{personInitials(subscription.person_name)}</AvatarFallback>
          </Avatar>
          <span data-billing-name>{subscription.person_name}</span>
        </span>
      </TableCell>
      <TableCell>
        {subscription.plan_name}
        <span data-billing-amount>{price(subscription)}</span>
      </TableCell>
      <TableCell>
        <StateBadge status={subscription.status} />
      </TableCell>
      <TableCell>{subscriptionDateLine(subscription)}</TableCell>
      <TableCell align="end">
        <SubscriptionMenu subscription={subscription} onAct={onAct} />
      </TableCell>
    </TableRow>
  )
}

/** The row stacked: who, what they pay, where the plan stands and its date. */
function SubscriptionCard({ subscription, onAct }: SubscriptionEntryProps) {
  const hasActions = availableActions(subscription.status).length > 0
  return (
    <Card size="sm" data-billing-card>
      <CardHeader>
        <div data-billing-person>
          <Avatar decorative>
            <AvatarFallback>{personInitials(subscription.person_name)}</AvatarFallback>
          </Avatar>
          <div data-billing-card-name>
            {/* The heading role, so a list of cards can be navigated by name. */}
            <strong role="heading" aria-level={3} data-billing-name>
              {subscription.person_name}
            </strong>
            <span data-billing-amount>
              {subscription.plan_name} · {price(subscription)}
            </span>
          </div>
        </div>
        {hasActions ? (
          <CardAction>
            <SubscriptionMenu subscription={subscription} onAct={onAct} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardFooter data-billing-card-foot>
        <StateBadge status={subscription.status} />
        <span data-billing-card-date>{cardDateLine(subscription)}</span>
      </CardFooter>
    </Card>
  )
}

/**
 * Only what the command would accept, the action that cannot be undone set
 * apart. An ended subscription takes nothing, so it has no menu at all.
 */
function SubscriptionMenu({ subscription, onAct }: SubscriptionEntryProps) {
  const actions = availableActions(subscription.status)
  if (actions.length === 0) return null
  const reversible = actions.filter((action) => action !== 'end')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones del plan de ${subscription.person_name}`}
            data-billing-menu
          />
        }
      >
        <FoundationIcon name="more" decorative />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-billing-menu-content>
        <DropdownMenuGroup>
          {reversible.map((action) => (
            <DropdownMenuItem
              key={action}
              onClick={() => onAct(action, subscription)}
              data-billing-action={action}
            >
              {menuActionLabel(action)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onAct('end', subscription)}
            data-billing-action="end"
          >
            {menuActionLabel('end')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StateBadge({ status }: { status: OrganizationSubscription['status'] }) {
  return <Badge variant={badgeVariant(status)}>{statusLabel(status)}</Badge>
}

/** The outline of the screen to come, so nothing jumps when the list arrives. */
function SubscriptionsSkeleton() {
  return (
    <div data-billing-loading role="status" aria-label="Cargando los cobros">
      <Skeleton data-billing-skeleton="summary" />
      <Skeleton data-billing-skeleton="toolbar" />
      {SKELETON_ROWS.map((row) => (
        <Skeleton key={row} data-billing-skeleton="row" />
      ))}
    </div>
  )
}

function price(subscription: OrganizationSubscription): string {
  return `${formatAmount(subscription.amount_minor, subscription.currency_code)} ${formatPeriod(
    subscription.billing_period,
  )}`
}

// A column names the date in the table; a card has none, so the charge is named here.
function cardDateLine(subscription: OrganizationSubscription): string {
  const line = subscriptionDateLine(subscription)
  return subscription.status === 'active' && subscription.current_period_end
    ? `Cobro: ${line}`
    : line
}

function badgeVariant(status: OrganizationSubscription['status']) {
  if (status === 'active') return 'success' as const
  if (status === 'suspended') return 'warning' as const
  return 'secondary' as const
}

function noMatchTitle(filters: SubscriptionFilters): string {
  if (filters.term.trim() !== '') return 'Ninguna persona coincide'
  if (filters.status === 'active') return 'Nadie está al día'
  if (filters.status === 'suspended') return 'Ningún plan está en pausa'
  return 'Ningún plan ha terminado'
}

function noMatchDescription(filters: SubscriptionFilters): string {
  return filters.term.trim() !== ''
    ? 'Cambia la búsqueda o el estado para ver más.'
    : 'Prueba con otro estado para ver el resto de las suscripciones.'
}

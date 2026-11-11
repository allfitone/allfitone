'use client'

/**
 * The plans a gym sells: `HU-STUDIO-077`.
 *
 * Built on the content register: a card per plan, the state under its name,
 * and a disclosure with every price it has had. Criterion 1, drafts told apart
 * from published versions, is the state line (`planStateLine`). Criterion 2,
 * never another organization's plans, is the read's: nothing here filters.
 */

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Badge } from '@allfitone/react/components/badge'
import { Button } from '@allfitone/react/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@allfitone/react/components/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@allfitone/react/components/collapsible'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@allfitone/react/components/empty'
import { Spinner } from '@allfitone/react/components/spinner'
import { FoundationIcon } from '@allfitone/react/icons'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { planStateLine, planVersionLine, versionStatusLabel } from '@/lib/plan-catalog'
import type { OrganizationPlan } from '@/lib/studio-api'
import { organizationPlansQueryOptions } from '@/lib/studio-query'

const PAGE_SIZE = 50

export function PlanRegister({ organizationId }: { organizationId: string }) {
  const query = useInfiniteQuery(organizationPlansQueryOptions(organizationId, PAGE_SIZE))
  const plans = query.data?.pages.flatMap((page) => page.data) ?? []
  const reading = query.hasNextPage

  // A gym sells a handful of plans: every page is read, so the list is whole.
  useEffect(() => {
    if (reading && !query.isFetchingNextPage) void query.fetchNextPage()
  }, [reading, query])

  if (query.isPending || reading) {
    return (
      <div data-content-catalog-state>
        <Spinner label="Cargando los planes" />
        <p>Cargando los planes…</p>
      </div>
    )
  }

  if (query.isError) {
    return (
      <Alert variant="danger" live="polite">
        <AlertTitle>No pudimos cargar los planes</AlertTitle>
        <AlertDescription>
          La conexión falló de forma temporal. Nada se muestra hasta comprobarlo de nuevo, para que
          no parezca que no vendemos nada.
        </AlertDescription>
        <AlertAction>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  if (plans.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FoundationIcon name="overview" decorative />
          </EmptyMedia>
          <EmptyTitle>Todavía no hay planes</EmptyTitle>
          <EmptyDescription>
            Un plan es lo que una persona paga para entrenar con vosotros. Primero tiene un nombre;
            se puede vender cuando se le publica un precio.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div data-content-register>
      {plans.map((plan) => (
        <PlanCard key={plan.plan_id} plan={plan} />
      ))}
    </div>
  )
}

function PlanCard({ plan }: { plan: OrganizationPlan }) {
  const [open, setOpen] = useState(false)
  const versions = plan.versions.length
  return (
    <Collapsible open={open} onOpenChange={setOpen} data-content-card="plans">
      <Card data-content-register-item>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {plan.name}
          </CardTitle>
          {/* Criterion 1: a draft, a price on sale, or nothing on sale. */}
          <CardDescription data-content-state>{planStateLine(plan)}</CardDescription>
        </CardHeader>
        <CardContent data-content-card-body>
          {versions > 0 ? (
            <div data-content-disclosure>
              <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                {open ? 'Ocultar precios' : `Ver precios · ${versions}`}
              </CollapsibleTrigger>
            </div>
          ) : null}
          <CollapsibleContent>
            <ul data-content-version-list>
              {plan.versions.map((version) => (
                <li key={version.plan_version_id}>
                  <span>{planVersionLine(version)}</span>
                  <Badge variant={version.status === 'published' ? 'secondary' : 'outline'}>
                    {versionStatusLabel(version)}
                  </Badge>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  )
}

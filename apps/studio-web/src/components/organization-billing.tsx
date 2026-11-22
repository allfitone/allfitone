'use client'

/**
 * Cobros: who pays the organization, and the plans it sells.
 *
 * Two tabs, like Biblioteca, because the two halves have different readers.
 * Who pays and how each one stands is `manage_billing`'s alone (`HU-STUDIO-078`
 * criterion 2: not a coach, not staff). The plans are the whole team's
 * (`HU-STUDIO-077`), because a price is nobody's personal data and a coach
 * selling a plan needs to know what it costs. So an owner or an admin sees
 * both tabs, and anybody else sees the plans and a line saying why the rest
 * is not theirs.
 *
 * Shaped as the library is: the address names the tab, so the way back from a
 * plan lands on the plans; and creating a plan is a dialog over them, offered
 * where the plans are and not over the list of who pays.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { Button } from '@allfitone/react/components/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { FoundationIcon } from '@allfitone/react/icons'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LibrarySkeleton, LibraryToaster } from './library-views'
import { useOrganizationContext } from './organization-context'
import { OrganizationSubscriptions } from './organization-subscriptions'
import { PlanCreateDialog } from './plan-create'
import { PlanRegister } from './plan-register'
import { WorkspacePageHeader } from './workspace-page-header'
import { billingPath, billingTabFromQuery, type BillingTab } from '@/lib/billing-navigation'
import { canManageBilling } from '@/lib/organization-billing'
import { organizationRolesQueryOptions } from '@/lib/studio-query'

export function OrganizationBilling({ initialCreate = false }: { initialCreate?: boolean }) {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const canManage = canManageBilling(current.roles, rolesQuery.data?.items)
  // The address is the only place the tab lives, so going back restores it.
  const tab = billingTabFromQuery(useSearchParams().get('tab') ?? undefined)
  const [creating, setCreating] = useState(initialCreate)

  // Next keeps `useSearchParams` in step with the history API: no navigation, no reload.
  function showTab(next: BillingTab): void {
    window.history.replaceState(null, '', billingPath(organizationId, next))
  }

  // A request to create is answered once: going back must not open the dialog again.
  useEffect(() => {
    if (initialCreate) {
      window.history.replaceState(null, '', billingPath(organizationId, 'plans'))
    }
  }, [initialCreate, organizationId])

  if (rolesQuery.isPending) {
    return (
      <section data-billing-page="register" aria-label="Cobros de la organización">
        <LibrarySkeleton label="Cargando los cobros" />
      </section>
    )
  }

  if (!canManage) {
    return (
      <section data-billing-page="register" aria-label="Cobros de la organización">
        <WorkspacePageHeader
          description={`Los planes que ofrece ${current.display_name} y lo que cuesta cada uno.`}
        />
        {/* Somebody who followed a link to create a plan is told why nothing opened. */}
        {initialCreate ? (
          <Alert variant="warning" live="polite" data-billing-create-refusal>
            <AlertTitle>Tu rol no crea planes</AlertTitle>
            <AlertDescription>
              Crear planes corresponde a quienes administran los cobros de {current.display_name}:
              propietario y administración.
            </AlertDescription>
          </Alert>
        ) : null}
        <Alert variant="warning">
          <AlertTitle>Las suscripciones no son de tu rol</AlertTitle>
          <AlertDescription>
            Quién paga y cómo va cada persona lo ven quienes administran los cobros de{' '}
            {current.display_name}. Lo que paga una persona no es un dato de entrenamiento, así que
            no se comparte con quien la atiende. Los planes sí son de todo el equipo.
          </AlertDescription>
        </Alert>
        <PlanRegister organizationId={organizationId} />
      </section>
    )
  }

  const create = () => setCreating(true)

  return (
    <section data-billing-page="register" aria-label="Cobros de la organización">
      <WorkspacePageHeader
        description={`Quién paga ${current.display_name}, en qué plan está cada persona, y los planes que vende.`}
        actions={
          tab === 'plans' ? (
            <Button onClick={create} data-billing-create-action>
              <FoundationIcon name="add" decorative />
              Nuevo plan
            </Button>
          ) : undefined
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          showTab(billingTabFromQuery(typeof value === 'string' ? value : undefined))
        }
        data-content-tabs
      >
        <TabsList variant="line" aria-label="Secciones de los cobros">
          <TabsTrigger value="subscriptions">Suscripciones</TabsTrigger>
          <TabsTrigger value="plans">Planes</TabsTrigger>
        </TabsList>
        {/* A panel is mounted only while open, so nothing is read for a tab nobody looked at. */}
        <TabsContent value="subscriptions">
          <OrganizationSubscriptions />
        </TabsContent>
        <TabsContent value="plans">
          <PlanRegister organizationId={organizationId} onCreate={create} />
        </TabsContent>
      </Tabs>

      <PlanCreateDialog open={creating} onOpenChange={setCreating} />
      {/* Last, so the room the section keeps between its parts falls under them. */}
      <LibraryToaster />
    </section>
  )
}

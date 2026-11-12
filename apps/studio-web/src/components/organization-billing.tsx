'use client'

/**
 * Cobros: who pays the organization, and the plans it sells.
 *
 * Two tabs, like Contenido, because the two halves have different readers.
 * Who pays and how each one stands is `manage_billing`'s alone (`HU-STUDIO-078`
 * criterion 2: not a coach, not staff). The plans are the whole team's
 * (`HU-STUDIO-077`), because a price is nobody's personal data and a coach
 * selling a plan needs to know what it costs. So an owner or an admin sees
 * both tabs, and anybody else sees the plans and a line saying why the rest
 * is not theirs.
 */

import { Alert, AlertDescription, AlertTitle } from '@allfitone/react/components/alert'
import { buttonVariants } from '@allfitone/react/components/button'
import { Spinner } from '@allfitone/react/components/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { useOrganizationContext } from './organization-context'
import { OrganizationSubscriptions } from './organization-subscriptions'
import { PlanRegister } from './plan-register'
import { WorkspacePageHeader } from './workspace-page-header'
import { canManageBilling } from '@/lib/organization-billing'
import { organizationRolesQueryOptions } from '@/lib/studio-query'

export function OrganizationBilling() {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  const canManage = canManageBilling(current.roles, rolesQuery.data?.items)

  if (rolesQuery.isPending) {
    return (
      <section data-billing-page aria-label="Cobros de la organización">
        <div data-content-catalog-state>
          <Spinner label="Cargando los cobros" />
          <p>Cargando los cobros…</p>
        </div>
      </section>
    )
  }

  if (!canManage) {
    return (
      <section data-billing-page aria-label="Cobros de la organización">
        <WorkspacePageHeader
          description={`Los planes que ofrece ${current.display_name} y lo que cuesta cada uno.`}
        />
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

  return (
    <section data-billing-page aria-label="Cobros de la organización">
      <WorkspacePageHeader
        description={`Quién paga ${current.display_name}, en qué plan está cada persona, y los planes que vende.`}
        actions={
          <Link
            href={`/organizations/${organizationId}/billing/plans/new`}
            data-slot="button"
            data-variant="default"
            className={buttonVariants()}
          >
            Nuevo plan
          </Link>
        }
      />
      <Tabs defaultValue="subscriptions" data-content-tabs>
        <TabsList variant="line" aria-label="Secciones de los cobros">
          <TabsTrigger value="subscriptions">Suscripciones</TabsTrigger>
          <TabsTrigger value="plans">Planes</TabsTrigger>
        </TabsList>
        <TabsContent value="subscriptions">
          <OrganizationSubscriptions />
        </TabsContent>
        <TabsContent value="plans">
          <PlanRegister organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

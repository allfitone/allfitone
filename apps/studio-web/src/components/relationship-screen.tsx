'use client'

import { buttonVariants } from '@allfitone/react/components/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'

import { useOrganizationContext } from './organization-context'
import { RelationshipHistoryScreen } from './relationship-history'
import { RelationshipStateScreen } from './relationship-state'
import { WorkspacePageHeader } from './workspace-page-header'
import { relationshipPath } from '@/lib/client-directory'
import { relationshipTabFromQuery, type RelationshipTab } from '@/lib/relationship-sections'
import { relationshipQueryOptions } from '@/lib/studio-query'

/**
 * A client's link: how it stands, and how it got there.
 *
 * They were two addresses for one subject, joined by a button in each
 * direction, so reading the history and coming back was two presses. The
 * history also had no title of its own — its route was never added to the
 * workspace's map, so its heading read «Studio», the product's name where the
 * screen's belongs. One address cannot lose its name that way.
 *
 * Both sections are listed for every role. A coach reads a shorter history,
 * and the history says so itself rather than being hidden.
 */

function sectionDescription(tab: RelationshipTab, name: string | undefined, active: boolean) {
  if (tab === 'history') {
    // What it does not show belongs with what it does: the register below
    // carries no heading of its own, so this sentence is the whole frame.
    const kept = 'No muestra ningún dato suyo, solo los hechos del vínculo.'
    return name
      ? `Lo que ha pasado en el vínculo con ${name}, de lo más reciente a lo más antiguo. ${kept}`
      : `Lo que ha pasado en el vínculo, de lo más reciente a lo más antiguo. ${kept}`
  }
  if (!name) return 'Cómo está el vínculo, quién atiende y qué permisos concedió.'
  return active
    ? `Cómo está el vínculo con ${name}, quién la atiende y qué permisos concedió.`
    : `Cómo quedó el vínculo con ${name}, quién la atendía y qué permisos concedió.`
}

export function RelationshipScreen() {
  const { current } = useOrganizationContext()
  const params = useParams<{ relationshipId: string }>()
  // The same read the state panel makes; one request serves both.
  const query = useQuery(relationshipQueryOptions(current.organization_id, params.relationshipId))
  // The address is the only place the tab lives, so going back restores it.
  const tab = relationshipTabFromQuery(useSearchParams().get('tab') ?? undefined)

  // Next keeps `useSearchParams` in step with the history API: no navigation, no reload.
  function showTab(next: RelationshipTab): void {
    window.history.replaceState(
      null,
      '',
      relationshipPath(current.organization_id, params.relationshipId, next),
    )
  }

  return (
    <section data-relationship-screen aria-label="Vínculo">
      <WorkspacePageHeader
        description={sectionDescription(
          tab,
          query.data?.display_name,
          query.data?.status === 'active',
        )}
        actions={
          <Link
            href={`/organizations/${current.organization_id}/clients`}
            data-slot="button"
            data-variant="outline"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Volver a clientes
          </Link>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          showTab(relationshipTabFromQuery(typeof value === 'string' ? value : undefined))
        }
      >
        <TabsList variant="line" aria-label="Secciones del vínculo">
          <TabsTrigger value="state">Estado</TabsTrigger>
          <TabsTrigger value="history">Historia</TabsTrigger>
        </TabsList>
        {/* A panel is mounted only while open, so the history is not read for
            somebody who only wanted the state. */}
        <TabsContent value="state">
          <RelationshipStateScreen />
        </TabsContent>
        <TabsContent value="history">
          <RelationshipHistoryScreen />
        </TabsContent>
      </Tabs>
    </section>
  )
}

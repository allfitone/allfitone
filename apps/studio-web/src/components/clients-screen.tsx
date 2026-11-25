'use client'

import { buttonVariants } from '@allfitone/react/components/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import { AuthorizedScopeRegister } from './authorized-scope-register'
import { ClientDirectoryList } from './client-directory-list'
import { CorrectionProposalRegisterScreen } from './correction-proposal-register'
import { InformationCategoryCatalog } from './information-category-catalog'
import { useOrganizationContext } from './organization-context'
import { WorkspacePageHeader } from './workspace-page-header'
import { clientTabFromQuery, clientsPath, type ClientTab } from '@/lib/client-sections'
import { seesEveryClient } from '@/lib/client-directory'
import { canInviteClients } from '@/lib/client-invitations'
import { organizationRolesQueryOptions, type ClientFilter } from '@/lib/studio-query'

/**
 * The clients: the people, what the catalogue of categories covers, what each
 * person authorized, and the corrections the reader proposed.
 *
 * The three consultations were pages of their own, reached from a row of text
 * links at the foot of the directory and each titling itself differently under
 * one sidebar entry. They are tabs now, as the library's and the team's are.
 *
 * Every section is listed for every role. Each one explains its own denial,
 * and authorization still fails closed on the server.
 */

/** One word where the screen allows it: the strip has four and a phone is 390px. */
const TAB_LABEL: Record<ClientTab, string> = {
  directory: 'Clientes',
  categories: 'Categorías',
  authorizations: 'Autorizaciones',
  proposals: 'Propuestas',
}

/**
 * Each sentence names what the section holds and tells the reader to do
 * nothing, the way the library's does: an instruction reads wrong above a
 * section that is explaining why it is shut.
 */
function sectionDescription(
  tab: ClientTab,
  organizationName: string,
  everyClient: boolean,
): string {
  if (tab === 'categories') {
    return 'Las siete categorías de información fijas de Allfit One: qué abarca cada una, y dónde para, antes de pedirle algo a un cliente.'
  }
  if (tab === 'authorizations') {
    return everyClient
      ? `Qué autorizó cada persona vinculada con ${organizationName}, y desde cuándo.`
      : 'Qué autorizó cada persona que atiendes, y desde cuándo.'
  }
  if (tab === 'proposals') {
    return 'Las correcciones que propusiste a las personas que atiendes, de la que vence primero a la que vence después. Solo las tuyas.'
  }
  return everyClient
    ? `Las personas vinculadas con ${organizationName} y a quienes invitaron.`
    : 'Las personas que atiendes y las invitaciones que enviaste.'
}

export function ClientsScreen({ initialFilter = 'all' }: { initialFilter?: ClientFilter }) {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  const rolesQuery = useQuery(organizationRolesQueryOptions(organizationId))
  // The address is the only place the tab lives, so going back restores it.
  const tab = clientTabFromQuery(useSearchParams().get('tab') ?? undefined)

  const everyClient = seesEveryClient(current.roles, rolesQuery.data?.items)
  // Inviting belongs to the directory: it is what adds a row to that register.
  const mayInvite = tab === 'directory' && canInviteClients(current.roles, rolesQuery.data?.items)

  // Next keeps `useSearchParams` in step with the history API: no navigation, no reload.
  function showTab(next: ClientTab): void {
    window.history.replaceState(null, '', clientsPath(organizationId, next))
  }

  return (
    <section data-client-page aria-label="Clientes">
      <WorkspacePageHeader
        description={sectionDescription(tab, current.display_name, everyClient)}
        actions={
          mayInvite ? (
            <Link
              href={`/organizations/${organizationId}/clients/invitations/new`}
              data-slot="button"
              data-variant="default"
              className={buttonVariants()}
            >
              Invitar cliente
            </Link>
          ) : null
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          showTab(clientTabFromQuery(typeof value === 'string' ? value : undefined))
        }
      >
        <TabsList variant="line" aria-label="Secciones de clientes">
          <TabsTrigger value="directory">{TAB_LABEL.directory}</TabsTrigger>
          <TabsTrigger value="categories">{TAB_LABEL.categories}</TabsTrigger>
          <TabsTrigger value="authorizations">{TAB_LABEL.authorizations}</TabsTrigger>
          <TabsTrigger value="proposals">{TAB_LABEL.proposals}</TabsTrigger>
        </TabsList>
        {/* A panel is mounted only while open, so nothing is read for a tab
            nobody looked at. */}
        <TabsContent value="directory">
          <ClientDirectoryList key={initialFilter} initialFilter={initialFilter} />
        </TabsContent>
        <TabsContent value="categories">
          <InformationCategoryCatalog />
        </TabsContent>
        <TabsContent value="authorizations">
          <AuthorizedScopeRegister />
        </TabsContent>
        <TabsContent value="proposals">
          <CorrectionProposalRegisterScreen />
        </TabsContent>
      </Tabs>
    </section>
  )
}

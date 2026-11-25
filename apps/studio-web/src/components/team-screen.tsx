'use client'

import { Button } from '@allfitone/react/components/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@allfitone/react/components/tabs'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LibraryToaster } from './library-views'
import { useOrganizationContext } from './organization-context'
import { OrganizationRoleCatalog } from './organization-role-catalog'
import { TeamInvitationCreateDialog } from './team-invitation-create'
import { TeamInvitationList } from './team-invitation-list'
import { TeamMembershipList } from './team-membership-list'
import { WorkspacePageHeader } from './workspace-page-header'
import { canInviteTeam } from '@/lib/team-invitations'
import { teamPath, teamTabFromQuery, type TeamTab } from '@/lib/team-sections'

/**
 * The team: its members, the invitations it has out, and what each role may do.
 *
 * The three were pages of their own under one sidebar entry, each titling
 * itself differently, with a sub-navigation above them that no other section
 * of the workspace had. They are one screen now, as the library's three are.
 *
 * Every section is listed for every role, as it was before the tabs: hiding one
 * made the same sidebar entry resolve to a different page per person, and left
 * a coach who opened an invitation link on a screen with no tab selected. Each
 * section explains its own denial, and authorization still fails closed on the
 * server.
 */

const INVITATIONS_ENABLED = process.env.NEXT_PUBLIC_STAFF_INVITATIONS_ENABLED === 'true'

/** Both labels lead to the same form, and each says it in the words of its own tab. */
const INVITE_LABEL: Record<TeamTab, string | null> = {
  members: 'Invitar integrante',
  invitations: 'Nueva invitación',
  roles: null,
}

/**
 * Each sentence names what the section holds, the way the library's does, and
 * none of them tells the reader to do anything. An instruction was wrong above
 * a refusal: a coach read «consulta las membresías» directly over the notice
 * saying she may not. That the four roles cannot be customised is the one fact
 * a reader could not get anywhere else, so it stays in the sentence.
 */
function sectionDescription(tab: TeamTab, organizationName: string): string {
  if (tab === 'invitations') return 'El destino, la propuesta y el estado de cada invitación.'
  if (tab === 'roles') {
    return `Los cuatro roles fijos de Allfit One y para qué sirve cada uno en ${organizationName}.`
  }
  return `Las membresías activas y finalizadas de ${organizationName}.`
}

export function TeamScreen({ initialInvite = false }: { initialInvite?: boolean }) {
  const { current } = useOrganizationContext()
  const organizationId = current.organization_id
  // The address is the only place the tab lives, so going back restores it.
  const tab = teamTabFromQuery(useSearchParams().get('tab') ?? undefined)

  const [inviting, setInviting] = useState(initialInvite)

  // Next keeps `useSearchParams` in step with the history API: no navigation, no reload.
  function showTab(next: TeamTab): void {
    window.history.replaceState(null, '', teamPath(organizationId, next))
  }

  // A request to invite is answered once: going back must not reopen the dialog.
  useEffect(() => {
    if (initialInvite) {
      window.history.replaceState(null, '', teamPath(organizationId, 'invitations'))
    }
  }, [initialInvite, organizationId])

  const inviteLabel = INVITE_LABEL[tab]
  const mayInvite = INVITATIONS_ENABLED && canInviteTeam(current.roles)

  return (
    <section data-team-page aria-label="Equipo">
      <WorkspacePageHeader
        description={sectionDescription(tab, current.display_name)}
        actions={
          inviteLabel && mayInvite ? (
            <Button onClick={() => setInviting(true)}>{inviteLabel}</Button>
          ) : null
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          showTab(teamTabFromQuery(typeof value === 'string' ? value : undefined))
        }
      >
        <TabsList variant="line" aria-label="Secciones del equipo">
          <TabsTrigger value="members">Integrantes</TabsTrigger>
          <TabsTrigger value="invitations">Invitaciones</TabsTrigger>
          {/* One word, like its two siblings: «Roles y permisos» wrapped to two
              lines on a phone. */}
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        {/* A panel is mounted only while open, so nothing is read for a tab
            nobody looked at. */}
        <TabsContent value="members">
          <TeamMembershipList />
        </TabsContent>
        <TabsContent value="invitations">
          <TeamInvitationList />
        </TabsContent>
        <TabsContent value="roles">
          <OrganizationRoleCatalog />
        </TabsContent>
      </Tabs>

      {/* A request that came by address still waits on the capability: no form
          for a role the command would refuse. */}
      <TeamInvitationCreateDialog
        open={inviting && mayInvite}
        onOpenChange={(open) => {
          if (!open) setInviting(false)
        }}
        onCreated={() => showTab('invitations')}
      />
      <LibraryToaster />
    </section>
  )
}

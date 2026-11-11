import {
  QueryClient,
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
} from '@tanstack/react-query'

import {
  StudioApiError,
  studioApi,
  type AuthorizedExecutionPage,
  type AuthorizedExecutionSummary,
  type CatalogActivityTypeList,
  type CatalogDisciplineList,
  type OrganizationMovement,
  type SessionTemplateDraft,
  type StudioMovementPage,
  type ClientDirectoryGroup,
  type InformationCategoryList,
  type OfferableScopeCatalog,
  type ClientDirectoryItem,
  type ClientDirectoryPage,
  type OrganizationMembership,
  type OrganizationMembershipPage,
  type OrganizationMembershipStatus,
  type OrganizationSubscription,
  type OrganizationSubscriptionPage,
  type SubscriptionStatus,
  type ProgramPage,
  type ProgramVersion,
  type SessionTemplatePage,
  type SessionTemplateVersion,
  type ProfessionalCredential,
  type ProfessionalProfile,
  type StudioMe,
  type TeamInvitationPage,
  type TeamInvitationStatus,
} from './studio-api'
import type { MovementSearchFilters } from './movement-search'

export type MembershipFilter = OrganizationMembershipStatus | 'all'
export type InvitationFilter = TeamInvitationStatus | 'all'
export type ClientFilter = ClientDirectoryGroup | 'all'
export type SubscriptionFilter = SubscriptionStatus | 'all'

export const STUDIO_QUERY_GC_TIME_MS = 5 * 60 * 1000
export const STUDIO_TEAM_STALE_TIME_MS = 30 * 1000
export const STUDIO_PROFILE_STALE_TIME_MS = 2 * 60 * 1000
export const STUDIO_ORGANIZATION_STALE_TIME_MS = 2 * 60 * 1000
export const STUDIO_ROLE_STALE_TIME_MS = 5 * 60 * 1000
export const STUDIO_CATALOG_STALE_TIME_MS = 60 * 60 * 1000

const ROOT_KEY = ['studio'] as const

export const studioQueryKeys = {
  all: ROOT_KEY,
  organizationTypes: () => [...ROOT_KEY, 'organization-types'] as const,
  me: () => [...ROOT_KEY, 'me'] as const,
  professionalSpecialties: () => [...ROOT_KEY, 'catalog', 'professional-specialties'] as const,
  professionalCredentialTypes: () =>
    [...ROOT_KEY, 'catalog', 'professional-credential-types'] as const,
  organization: (organizationId: string) => [...ROOT_KEY, 'organization', organizationId] as const,
  organizationRoles: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'roles'] as const,
  organizationMembershipsRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'memberships'] as const,
  organizationMemberships: (organizationId: string, status: MembershipFilter, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'memberships', { status, limit }] as const,
  offerableScopes: () => [...ROOT_KEY, 'offerable-scopes'] as const,
  organizationProgramsRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'programs'] as const,
  organizationPrograms: (organizationId: string, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'programs', { limit }] as const,
  organizationProgramPages: (organizationId: string, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'programs', 'pages', { limit }] as const,
  organizationSessionTemplatesRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'session-templates'] as const,
  organizationSessionTemplates: (organizationId: string, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'session-templates', { limit }] as const,
  informationCategories: () => [...ROOT_KEY, 'information-categories'] as const,
  catalogDisciplines: () => [...ROOT_KEY, 'catalog', 'disciplines'] as const,
  catalogActivityTypes: () => [...ROOT_KEY, 'catalog', 'activity-types'] as const,
  organizationSessionTemplatePages: (organizationId: string, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'session-templates', 'pages', { limit }] as const,
  sessionTemplateVersion: (organizationId: string, templateId: string, versionNumber: number) =>
    [
      ...ROOT_KEY,
      'organization',
      organizationId,
      'session-templates',
      'version',
      templateId,
      versionNumber,
    ] as const,
  programVersion: (organizationId: string, programId: string, versionNumber: number) =>
    [
      ...ROOT_KEY,
      'organization',
      organizationId,
      'programs',
      'version',
      programId,
      versionNumber,
    ] as const,
  sessionTemplateDraft: (organizationId: string, templateId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'session-template-draft', templateId] as const,
  organizationMovement: (organizationId: string, movementId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'movement', movementId] as const,
  organizationMovementsRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'movements'] as const,
  organizationMovements: (organizationId: string, filters: MovementSearchFilters, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'movements', { ...filters, limit }] as const,
  organizationClientsRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'clients'] as const,
  /*
   * The search belongs in the key, so a new term is a different query with its
   * own pages — which is also what drops the cursor, since a cursor the server
   * issued only resumes the search it was issued under. Without a term the key
   * keeps its old shape, so the unsearched directory and the invitation form
   * go on sharing one cache entry.
   */
  organizationClients: (
    organizationId: string,
    status: ClientFilter,
    limit: number,
    search?: string,
  ) =>
    [
      ...ROOT_KEY,
      'organization',
      organizationId,
      'clients',
      { status, limit, ...(search ? { search } : {}) },
    ] as const,
  authorizedScopesRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'authorized-scopes'] as const,
  authorizedScopes: (organizationId: string, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'authorized-scopes', { limit }] as const,
  organizationSubscriptionsRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'subscriptions'] as const,
  organizationSubscriptions: (organizationId: string, status: SubscriptionFilter, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'subscriptions', { status, limit }] as const,
  clientCard: (organizationId: string, personId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'client-card', personId] as const,
  clientTrainingProfile: (organizationId: string, personId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'client-training-profile', personId] as const,
  clientExecutions: (organizationId: string, personId: string, limit: number) =>
    [
      ...ROOT_KEY,
      'organization',
      organizationId,
      'client-executions',
      personId,
      { limit },
    ] as const,
  relationship: (organizationId: string, relationshipId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'relationship', relationshipId] as const,
  relationshipHistory: (organizationId: string, relationshipId: string, limit: number) =>
    [
      ...ROOT_KEY,
      'organization',
      organizationId,
      'relationship',
      relationshipId,
      'history',
      { limit },
    ] as const,
  organizationInvitationsRoot: (organizationId: string) =>
    [...ROOT_KEY, 'organization', organizationId, 'invitations'] as const,
  organizationInvitations: (organizationId: string, status: InvitationFilter, limit: number) =>
    [...ROOT_KEY, 'organization', organizationId, 'invitations', { status, limit }] as const,
} as const

export function createStudioQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: STUDIO_QUERY_GC_TIME_MS,
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: shouldRetryStudioQuery,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

export interface StudioQueryRuntime {
  readonly queryClient: QueryClient
  start(): void
  stop(): void
  runMutation<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T>
}

export class StudioQuerySessionCancelledError extends Error {
  constructor() {
    super('studio-query-session-cancelled')
    this.name = 'StudioQuerySessionCancelledError'
  }
}

export function isStudioQuerySessionCancelled(
  error: unknown,
): error is StudioQuerySessionCancelledError {
  return error instanceof StudioQuerySessionCancelledError
}

export function createStudioQueryRuntime(
  queryClient: QueryClient = createStudioQueryClient(),
): StudioQueryRuntime {
  let active = true
  let generation = 0
  const controllers = new Set<AbortController>()

  return {
    queryClient,
    start() {
      if (active) return
      generation += 1
      queryClient.clear()
      active = true
    },
    stop() {
      if (active) {
        active = false
        generation += 1
      }
      for (const controller of controllers) controller.abort()
      controllers.clear()
      queryClient.clear()
    },
    async runMutation<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (!active) throw new StudioQuerySessionCancelledError()
      const operationGeneration = generation
      const controller = new AbortController()
      controllers.add(controller)
      try {
        const result = await operation(controller.signal)
        if (!active || operationGeneration !== generation || controller.signal.aborted) {
          throw new StudioQuerySessionCancelledError()
        }
        return result
      } catch (error) {
        if (
          !active ||
          operationGeneration !== generation ||
          controller.signal.aborted ||
          isStudioQuerySessionCancelled(error)
        ) {
          throw new StudioQuerySessionCancelledError()
        }
        throw error
      } finally {
        controllers.delete(controller)
      }
    },
  }
}

export function shouldRetryStudioQuery(failureCount: number, error: Error): boolean {
  if (failureCount >= 1) return false
  if (error instanceof StudioApiError) return error.status === 503
  return error instanceof TypeError
}

/**
 * A denial, as opposed to an outage.
 *
 * The distinction decides what a surface may say and offer: a 403 is terminal,
 * shouldRetryStudioQuery above refuses to retry it, and a screen that presents
 * it as a temporary connection failure offers a retry that cannot succeed. That
 * defect reached the organization verification layer precisely because this
 * predicate was written inline in every component that needed it, so one of
 * them could be missing it without anywhere to notice.
 */
export function isStudioForbidden(error: unknown): boolean {
  return error instanceof StudioApiError && error.status === 403
}

/**
 * An organization this account cannot read, for either of two reasons.
 *
 * PostgreSQL answers the same 'organization not found' whether the row is
 * absent or the actor holds no active membership in it, so the two arrive here
 * as one 404 and must stay indistinguishable. A screen that told them apart
 * would turn the address bar into a directory of which organizations exist.
 */
export function isStudioNotFound(error: unknown): boolean {
  return error instanceof StudioApiError && error.status === 404
}

export function organizationQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.organization(organizationId),
    queryFn: ({ signal }) => studioApi.organization(organizationId, signal),
    staleTime: STUDIO_ORGANIZATION_STALE_TIME_MS,
  })
}

/**
 * Never cached, which for this one read is the contract and not a preference:
 * `OP-REL-019` answers `private-no-store`.
 *
 * It is also what the screen needs. This answer decides which categories appear
 * at all, so showing a remembered copy would put back a section the person
 * revoked seconds ago — and a section on screen is an invitation to go read what
 * is behind it. `gcTime: 0` drops it the moment nobody is looking, so coming
 * back to the card always asks again rather than painting the old answer while
 * the new one travels.
 *
 * The cost is a loading state on every arrival instead of a flash of stale
 * content. For an index of what somebody allowed, that is the right way round.
 */
export function clientCardQueryOptions(organizationId: string, personId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.clientCard(organizationId, personId),
    queryFn: ({ signal }) => studioApi.clientCard(organizationId, personId, signal),
    staleTime: 0,
    gcTime: 0,
  })
}

/**
 * Never cached, for the same reason as the card: `OP-IDN-018` answers
 * `private-no-store`, and a remembered copy would outlive the grant it was read
 * under — she can revoke the category between two visits.
 *
 * **And never refetched on its own.** Every answer here is a read of her data,
 * recorded inside the same transaction and shown to her. With the client's
 * defaults, alt-tabbing back to the screen would write her another access she
 * can see and the coach never asked for — a log of the window's focus rather
 * than of anybody's intent. So this is the one read in Studio that leaves the
 * window and the network alone and goes only when somebody arrives or presses
 * the button.
 */
export function clientTrainingProfileQueryOptions(organizationId: string, personId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.clientTrainingProfile(organizationId, personId),
    queryFn: ({ signal }) => studioApi.clientTrainingProfile(organizationId, personId, signal),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Her sessions, newest first, a page at a time. Read under the same rules as the
 * training profile and for the same reasons: `private-no-store`, so nothing is
 * remembered, and no refetch of its own, because each page is a read recorded
 * for her to see.
 *
 * It matters more here than there. An infinite query refetches **every page it
 * holds**, so a window regaining focus with four pages loaded would write her
 * four accesses nobody asked for.
 */
export function clientExecutionsQueryOptions(
  organizationId: string,
  personId: string,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.clientExecutions(organizationId, personId, limit),
    queryFn: ({ pageParam, signal }) =>
      studioApi.clientExecutions(
        organizationId,
        personId,
        { limit, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * One list, even though two categories feed it: the operation answers them
 * interleaved by when she trained, and a session can only arrive once.
 */
export function flattenExecutionPages(
  data: InfiniteData<AuthorizedExecutionPage, unknown> | undefined,
): AuthorizedExecutionSummary[] {
  if (!data) return []
  const sessions: AuthorizedExecutionSummary[] = []
  const seen = new Set<string>()
  for (const page of data.pages) {
    for (const session of page.data) {
      if (seen.has(session.id)) continue
      seen.add(session.id)
      sessions.push(session)
    }
  }
  return sessions
}

/**
 * The team stale time, not the organization one. Who attends a client changes
 * when somebody reassigns them, and a permission disappears the moment the
 * person revokes it — both are decisions other people make while this screen is
 * open, so it must not sit on a two-minute-old answer.
 */
export function relationshipQueryOptions(organizationId: string, relationshipId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.relationship(organizationId, relationshipId),
    queryFn: ({ signal }) => studioApi.relationshipState(organizationId, relationshipId, signal),
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/**
 * A relationship's past, newest first.
 *
 * Unlike the state beside it, this does not go stale: what already happened does
 * not change. What can change is that something new is added to the end of it,
 * which a reader notices by coming back rather than by this screen refetching
 * under them mid-scroll.
 */
export function relationshipHistoryQueryOptions(
  organizationId: string,
  relationshipId: string,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.relationshipHistory(organizationId, relationshipId, limit),
    queryFn: ({ pageParam, signal }) =>
      studioApi.relationshipHistory(
        organizationId,
        relationshipId,
        { limit, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function organizationTypesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.organizationTypes(),
    queryFn: ({ signal }) => studioApi.organizationTypes(signal),
    staleTime: STUDIO_CATALOG_STALE_TIME_MS,
  })
}

export function studioMeQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.me(),
    queryFn: ({ signal }) => studioApi.me(signal),
    staleTime: STUDIO_PROFILE_STALE_TIME_MS,
  })
}

export function professionalSpecialtiesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.professionalSpecialties(),
    queryFn: ({ signal }) => studioApi.professionalSpecialties(signal),
    staleTime: STUDIO_CATALOG_STALE_TIME_MS,
  })
}

export function professionalCredentialTypesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.professionalCredentialTypes(),
    queryFn: ({ signal }) => studioApi.professionalCredentialTypes(signal),
    staleTime: STUDIO_CATALOG_STALE_TIME_MS,
  })
}

export function organizationRolesQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.organizationRoles(organizationId),
    queryFn: ({ signal }) => studioApi.organizationRoles(organizationId, signal),
    staleTime: STUDIO_ROLE_STALE_TIME_MS,
  })
}

export function organizationMembershipsQueryOptions(
  organizationId: string,
  status: MembershipFilter,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationMemberships(organizationId, status, limit),
    queryFn: ({ pageParam, signal }) =>
      studioApi.organizationMemberships(
        organizationId,
        {
          ...(status === 'all' ? {} : { status }),
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function organizationInvitationsQueryOptions(
  organizationId: string,
  status: InvitationFilter,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationInvitations(organizationId, status, limit),
    queryFn: ({ pageParam, signal }) =>
      studioApi.teamInvitations(
        organizationId,
        {
          ...(status === 'all' ? {} : { status }),
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function organizationClientsQueryOptions(
  organizationId: string,
  status: ClientFilter,
  limit: number,
  search?: string,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationClients(organizationId, status, limit, search),
    queryFn: ({ pageParam, signal }) =>
      studioApi.organizationClients(
        organizationId,
        {
          ...(status === 'all' ? {} : { status }),
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
          ...(search ? { search } : {}),
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/*
 * Held as briefly as a directory page, and for a sharper reason: a person can
 * take an authorization back at any moment from Space. A stale page here would
 * show a permission that no longer stands — and this register exists precisely
 * to explain why something stopped being visible.
 */
export function authorizedScopesQueryOptions(organizationId: string, limit: number) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.authorizedScopes(organizationId, limit),
    queryFn: ({ pageParam, signal }) =>
      studioApi.authorizedScopes(
        organizationId,
        { limit, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/*
 * The permission vocabulary changes when Backoffice publishes a new scope
 * version, which is rare and never mid-session, so it is held longer than a
 * directory page.
 */
export function offerableScopesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.offerableScopes(),
    queryFn: ({ signal }): Promise<OfferableScopeCatalog> => studioApi.offerableScopes(signal),
    staleTime: STUDIO_ROLE_STALE_TIME_MS,
  })
}

/*
 * What a coach may offer with an invitation. Held at the team stale time rather
 * than the catalogue one: a version somebody retires while this form is open is
 * exactly the case the command refuses, and a two-minute-old list would offer
 * it. The server checks it again under a share lock either way.
 */
export function organizationSessionTemplatesQueryOptions(organizationId: string, limit: number) {
  return queryOptions({
    queryKey: studioQueryKeys.organizationSessionTemplates(organizationId, limit),
    queryFn: ({ signal }): Promise<SessionTemplatePage> =>
      studioApi.organizationSessionTemplates(organizationId, limit, signal),
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function organizationProgramsQueryOptions(organizationId: string, limit: number) {
  return queryOptions({
    queryKey: studioQueryKeys.organizationPrograms(organizationId, limit),
    queryFn: ({ signal }): Promise<ProgramPage> =>
      studioApi.organizationPrograms(organizationId, limit, signal),
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/**
 * The wording of the seven categories. It carries no version and nobody
 * publishes it, so it is as stale-tolerant as the role catalogue: the only way
 * it changes is a migration.
 */
export function informationCategoriesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.informationCategories(),
    queryFn: ({ signal }): Promise<InformationCategoryList> =>
      studioApi.informationCategories(signal),
    staleTime: STUDIO_ROLE_STALE_TIME_MS,
  })
}

/**
 * The disciplines a template can belong to. Published by Backoffice, which is
 * rare and never mid-session, so held as long as the role catalogue.
 */
export function catalogDisciplinesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.catalogDisciplines(),
    queryFn: ({ signal }): Promise<CatalogDisciplineList> => studioApi.catalogDisciplines(signal),
    staleTime: STUDIO_ROLE_STALE_TIME_MS,
  })
}

/*
 * A search, so every filter is part of the key: a new term is a new query with
 * its own pages, which also drops a cursor the server issued for the old one.
 * Held as briefly as a directory page because a teammate can add or archive a
 * movement while the editor is open.
 */
export function organizationMovementsQueryOptions(
  organizationId: string,
  filters: MovementSearchFilters,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationMovements(organizationId, filters, limit),
    queryFn: ({ pageParam, signal }): Promise<StudioMovementPage> =>
      studioApi.organizationMovements(
        organizationId,
        {
          ...(filters.term ? { search: filters.term } : {}),
          ...(filters.disciplineCode ? { discipline: filters.disciplineCode } : {}),
          includeArchived: filters.includeArchived,
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function catalogActivityTypesQueryOptions() {
  return queryOptions({
    queryKey: studioQueryKeys.catalogActivityTypes(),
    queryFn: ({ signal }): Promise<CatalogActivityTypeList> =>
      studioApi.catalogActivityTypes(signal),
    staleTime: STUDIO_ROLE_STALE_TIME_MS,
  })
}

/*
 * Every page of the library, for a screen that has to find one template in it:
 * the editor reads the discipline there, which the draft does not carry.
 */
export function organizationSessionTemplatePagesQueryOptions(
  organizationId: string,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationSessionTemplatePages(organizationId, limit),
    queryFn: ({ pageParam, signal }): Promise<SessionTemplatePage> =>
      studioApi.organizationSessionTemplates(organizationId, limit, signal, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/*
 * A published version's content never changes, but its status does when it is
 * retired, so it is revalidated like the listing rather than cached for good.
 */
export function sessionTemplateVersionQueryOptions(
  organizationId: string,
  templateId: string,
  versionNumber: number,
) {
  return queryOptions({
    queryKey: studioQueryKeys.sessionTemplateVersion(organizationId, templateId, versionNumber),
    queryFn: ({ signal }): Promise<SessionTemplateVersion> =>
      studioApi.organizationSessionTemplateVersion(
        organizationId,
        templateId,
        versionNumber,
        signal,
      ),
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function programVersionQueryOptions(
  organizationId: string,
  programId: string,
  versionNumber: number,
) {
  return queryOptions({
    queryKey: studioQueryKeys.programVersion(organizationId, programId, versionNumber),
    queryFn: ({ signal }): Promise<ProgramVersion> =>
      studioApi.organizationProgramVersion(organizationId, programId, versionNumber, signal),
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/*
 * Every page of the programs, for the editor: a program draft has no read of
 * its own, so the editor finds it in the listing.
 */
export function organizationProgramPagesQueryOptions(organizationId: string, limit: number) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationProgramPages(organizationId, limit),
    queryFn: ({ pageParam, signal }): Promise<ProgramPage> =>
      studioApi.organizationPrograms(organizationId, limit, signal, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

/*
 * The base an edit starts from. Never refetched behind the editor's back: the
 * screen keeps its own copy, and a draft somebody else saved arrives with the
 * conflict the next save meets, which is where it can be compared.
 */
export function sessionTemplateDraftQueryOptions(organizationId: string, templateId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.sessionTemplateDraft(organizationId, templateId),
    queryFn: ({ signal }): Promise<SessionTemplateDraft> =>
      studioApi.organizationSessionTemplateDraft(organizationId, templateId, signal),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

export function organizationMovementQueryOptions(organizationId: string, movementId: string) {
  return queryOptions({
    queryKey: studioQueryKeys.organizationMovement(organizationId, movementId),
    queryFn: ({ signal }): Promise<OrganizationMovement> =>
      studioApi.organizationMovement(organizationId, movementId, signal),
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function nextPageCursor(page: { page: { next_cursor: string | null } }): string | undefined {
  return page.page.next_cursor ?? undefined
}

/**
 * Entries are keyed by whichever id their kind carries. A relationship and an
 * invitation can never collide, because one id comes from
 * `service_relationships` and the other from `invitations`.
 */
export function flattenClientPages(
  data: InfiniteData<ClientDirectoryPage, unknown> | undefined,
): ClientDirectoryItem[] {
  if (!data) return []
  const entries: ClientDirectoryItem[] = []
  const seen = new Set<string>()
  for (const page of data.pages) {
    for (const entry of page.data) {
      const id = entry.kind === 'invitation' ? entry.invitation_id : entry.relationship_id
      if (seen.has(id)) continue
      seen.add(id)
      entries.push(entry)
    }
  }
  return entries
}

export function flattenMembershipPages(
  data: InfiniteData<OrganizationMembershipPage, unknown> | undefined,
): OrganizationMembership[] {
  if (!data) return []
  const memberships: OrganizationMembership[] = []
  const seen = new Set<string>()
  for (const page of data.pages) {
    for (const membership of page.data) {
      if (seen.has(membership.membership_id)) continue
      seen.add(membership.membership_id)
      memberships.push(membership)
    }
  }
  return memberships
}

export function flattenInvitationPages(
  data: InfiniteData<TeamInvitationPage, unknown> | undefined,
): TeamInvitationPage['data'] {
  if (!data) return []
  const invitations: TeamInvitationPage['data'] = []
  const seen = new Set<string>()
  for (const page of data.pages) {
    for (const invitation of page.data) {
      if (seen.has(invitation.id)) continue
      seen.add(invitation.id)
      invitations.push(invitation)
    }
  }
  return invitations
}

export function updateProfessionalProfileInMe(
  current: StudioMe | undefined,
  profile: ProfessionalProfile,
): StudioMe | undefined {
  return current ? { ...current, profile } : current
}

export function prependCredentialToMe(
  current: StudioMe | undefined,
  credential: ProfessionalCredential,
): StudioMe | undefined {
  if (!current?.profile) return current
  const credentials = [
    credential,
    ...current.profile.credentials.filter((candidate) => candidate.id !== credential.id),
  ]
  return { ...current, profile: { ...current.profile, credentials } }
}

export function replaceCredentialInMe(
  current: StudioMe | undefined,
  credential: ProfessionalCredential,
): StudioMe | undefined {
  if (!current?.profile) return current
  return {
    ...current,
    profile: {
      ...current.profile,
      credentials: current.profile.credentials.map((candidate) =>
        candidate.id === credential.id ? credential : candidate,
      ),
    },
  }
}

export function removeInvitationFromPages(
  current: InfiniteData<TeamInvitationPage, unknown> | undefined,
  invitationId: string,
): InfiniteData<TeamInvitationPage, unknown> | undefined {
  if (!current) return current
  return {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      data: page.data.filter((invitation) => invitation.id !== invitationId),
    })),
  }
}

/**
 * Who pays the organization.
 *
 * Held for the same short while as a directory page and never longer: the catalogue says
 * this is "nunca cacheable para decidir suspensión", and suspending somebody on a stale
 * state is how a person loses access for a charge that already cleared.
 */
export function organizationSubscriptionsQueryOptions(
  organizationId: string,
  status: SubscriptionFilter,
  limit: number,
) {
  return infiniteQueryOptions({
    queryKey: studioQueryKeys.organizationSubscriptions(organizationId, status, limit),
    queryFn: ({ pageParam, signal }) =>
      studioApi.organizationSubscriptions(
        organizationId,
        {
          ...(status === 'all' ? {} : { status }),
          limit,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: nextPageCursor,
    staleTime: STUDIO_TEAM_STALE_TIME_MS,
  })
}

export function flattenSubscriptionPages(
  data: InfiniteData<OrganizationSubscriptionPage, unknown> | undefined,
): OrganizationSubscription[] {
  if (!data) return []
  const subscriptions: OrganizationSubscription[] = []
  const seen = new Set<string>()
  for (const page of data.pages) {
    for (const subscription of page.data) {
      if (seen.has(subscription.subscription_id)) continue
      seen.add(subscription.subscription_id)
      subscriptions.push(subscription)
    }
  }
  return subscriptions
}

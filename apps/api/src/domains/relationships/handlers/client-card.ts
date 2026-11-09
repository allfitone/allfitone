/**
 * Projections for the client card (OP-REL-019) and what needs attention today
 * (OP-REL-020).
 *
 * PostgreSQL decides what each holds; what is added here is where to go next. A section
 * names the operations that read its category, so a screen asks each of them, and each
 * records its own access. A notice names the operation that resolves it. Both are facts
 * of this contract, not of the data, which is why they live beside the routes.
 */

import type { AllfitV1Schemas } from '@allfitone/contracts'

import type { ClientCard, StudioToday, StudioTodayNotices } from '../domain/index.js'

type ScopeCode = AllfitV1Schemas['ScopeCode']
type CardRead = AllfitV1Schemas['StudioClientCardRead']
type TodayLink = AllfitV1Schemas['StudioTodayLink']

/** Which published operations read each category, as their own contracts say. */
export const CARD_READS: Readonly<Record<ScopeCode, readonly CardRead[]>> = {
  relationship_training: [
    'getAuthorizedClientTrainingProfile',
    'listAuthorizedClientExecutions',
    'getAuthorizedClientProgress',
    'listRelationshipAssignments',
  ],
  prior_training_history: ['listAuthorizedClientExecutions', 'getAuthorizedClientProgress'],
  body_progress: ['listAuthorizedClientBodyProgress', 'listAuthorizedClientBodyPhotos'],
  health_context: ['listAuthorizedClientHealthContext'],
  nutrition_intake: [
    'listAuthorizedClientNutritionMeals',
    'listAuthorizedClientNutritionDailySummaries',
  ],
  nutrition_guidance: ['listAuthorizedClientNutritionGoalVersions'],
  nutrition_media: ['getAuthorizedClientNutritionMealPhoto'],
}

const TODAY_LINKS: Readonly<Record<keyof StudioTodayNotices, TodayLink>> = {
  client_invitations: {
    operation_id: 'listStudioOrganizationClients',
    query: { status: 'invited' },
  },
  unassigned_relationships: { operation_id: 'assignRelationshipHolder', query: {} },
  termination_requests: { operation_id: 'terminateRelationship', query: {} },
  team_invitations: { operation_id: 'listStudioTeamInvitations', query: {} },
  team: { operation_id: 'listStudioOrganizationMemberships', query: {} },
  new_relationships: { operation_id: 'listStudioOrganizationClients', query: { status: 'active' } },
  training: { operation_id: 'getStudioClientCard', query: {} },
}

export function presentCard(card: ClientCard): AllfitV1Schemas['StudioClientCard'] {
  if (card.kind === 'former') return card
  return {
    ...card,
    sections: card.sections.map((section) => ({
      ...section,
      reads: [...CARD_READS[section.scope_code]],
    })),
  }
}

// An absent notice stays absent: she cannot resolve it, so it is not hers to see empty.
export function presentToday(today: StudioToday): AllfitV1Schemas['StudioToday'] {
  const {
    client_invitations,
    unassigned_relationships,
    termination_requests,
    team_invitations,
    team,
    new_relationships,
    training,
  } = today.notices
  return {
    ...today,
    notices: {
      ...(client_invitations && {
        client_invitations: { ...client_invitations, link: TODAY_LINKS.client_invitations },
      }),
      ...(unassigned_relationships && {
        unassigned_relationships: {
          ...unassigned_relationships,
          link: TODAY_LINKS.unassigned_relationships,
        },
      }),
      ...(termination_requests && {
        termination_requests: { ...termination_requests, link: TODAY_LINKS.termination_requests },
      }),
      ...(team_invitations && {
        team_invitations: { ...team_invitations, link: TODAY_LINKS.team_invitations },
      }),
      ...(team && { team: { ...team, link: TODAY_LINKS.team } }),
      ...(new_relationships && {
        new_relationships: { ...new_relationships, link: TODAY_LINKS.new_relationships },
      }),
      ...(training && { training: { ...training, link: TODAY_LINKS.training } }),
    },
  }
}

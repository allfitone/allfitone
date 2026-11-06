/**
 * The rules of the seven V1 permissions: what each one says it reaches, and at which level.
 *
 * A published version is immutable and a grant points at it for good, so these rules are
 * reviewed here, against the database, before anyone publishes them from `/permissions`.
 * `publish-local-scopes.ts` publishes them on this machine, and
 * `tests/scope-definitions.test.ts` holds them to what the policies actually let a
 * professional do, so a rule cannot quietly describe access that does not exist.
 */

export interface Rule {
  resource: string
  field: string
  data_classification_code: 'training' | 'body' | 'health' | 'nutrition'
  max_action: 'read' | 'contribute'
  is_excluded?: boolean
  historical_readable?: boolean
}

export interface ScopeRules {
  code: string
  rules: Rule[]
}

/**
 * What a coach writes on her behalf inside the relationship. The steps, sets and targets a
 * planned session points at are the gym's own template, not her data: no grant reaches them.
 */
const TRAINING_PRESCRIPTION = [
  'planning.program_assignments',
  'planning.planned_sessions',
  // What the coach changed for this one person: her adjusted targets and moved days.
  'planning.prescription_revisions',
  'planning.planned_session_reschedules',
  'planning.assignment_management_periods',
]

/** What she trained. Only she records it; a professional reads it and never writes it. */
const TRAINING_EXECUTION = [
  'execution.executed_sessions',
  'execution.session_segments',
  'execution.session_exercises',
  'execution.strength_sets',
  'execution.interval_results',
  'execution.round_results',
  'execution.mobility_results',
]

const LAP_FIELDS = [
  'lap_number',
  'distance_value',
  'distance_unit_code',
  'duration_seconds',
  'elevation_gain_value',
  'elevation_gain_unit_code',
]

/** Saying it out loud is the point: an omission reads as an oversight, this reads as a rule. */
function denied(
  resource: string,
  classification: Rule['data_classification_code'],
  field = '*',
): Rule {
  return {
    resource,
    field,
    data_classification_code: classification,
    max_action: 'read',
    is_excluded: true,
  }
}

function training(resource: string, action: Rule['max_action'], field = '*'): Rule {
  return {
    resource,
    field,
    data_classification_code: 'training',
    max_action: action,
    historical_readable: action === 'read',
  }
}

/** Her training profile, claim by claim with its origin, and her biological sex. No history:
 * the coach reads what holds now, never what she declared before the grant. */
const TRAINING_PROFILE: Rule[] = [
  ...['attribute_code', 'value_text', 'value_numeric', 'unit_code', 'provenance', 'valid_from'].map(
    (field): Rule => ({
      resource: 'identity.fitness_profile_claims',
      field,
      data_classification_code: 'training',
      max_action: 'read',
    }),
  ),
  {
    resource: 'identity.people',
    field: 'biological_sex',
    data_classification_code: 'training',
    max_action: 'read',
  },
]

/** Her results, read only: a lap by its fields, because its heart rate is in no V1 scope. */
const trainingResults = (): Rule[] => [
  ...TRAINING_EXECUTION.map((resource) => training(resource, 'read')),
  ...LAP_FIELDS.map((field) => training('execution.endurance_laps', 'read', field)),
  denied('execution.endurance_laps', 'health', 'avg_heart_rate_bpm'),
]

export const V1_SCOPES: ScopeRules[] = [
  {
    code: 'relationship_training',
    rules: [
      // `contribute` carries no history: the check keeps a historical rule at `read`.
      ...TRAINING_PRESCRIPTION.map((resource) => training(resource, 'contribute')),
      // The coach's reading of a session the gym's programme produced, beside what she declared.
      training('execution.professional_observations', 'contribute'),
      // A correction he proposes to a set she declared; nothing changes until she accepts it.
      training('execution.correction_proposals', 'contribute'),
      // Read whenever they happened: the policy that admits a session never asks when the
      // grant began, so the rule says so instead of promising less than is shared.
      training('execution.planned_session_executions', 'read'),
      ...trainingResults(),
      ...TRAINING_PROFILE,
      denied('identity.body_progress_records', 'body'),
      denied('identity.body_photos', 'body'),
      denied('identity.health_context_claims', 'health'),
      denied('nutrition.meals', 'nutrition'),
    ],
  },
  {
    code: 'prior_training_history',
    rules: [
      ...trainingResults(),
      denied('planning.program_versions', 'training'),
      denied('planning.program_drafts', 'training'),
      denied('identity.body_progress_records', 'body'),
      denied('identity.health_context_claims', 'health'),
    ],
  },
  {
    code: 'body_progress',
    rules: [
      ...[
        'metric_code',
        'value_numeric',
        'unit_code',
        'original_value',
        'original_unit_code',
        'measured_on',
      ].map((field): Rule => ({
        resource: 'identity.body_progress_records',
        field,
        data_classification_code: 'body',
        max_action: 'read',
        historical_readable: true,
      })),
      // Only the photos she shows that gym: the image travels through the API's proxy and
      // the key itself never leaves the API (`identity.body_photo_shares`).
      ...['taken_on', 'media_ref'].map((field): Rule => ({
        resource: 'identity.body_photos',
        field,
        data_classification_code: 'body',
        max_action: 'read',
      })),
      denied('identity.body_progress_records', 'body', 'media_ref'),
      denied('identity.body_progress_records', 'body', 'has_media'),
      denied('identity.health_context_claims', 'health'),
    ],
  },
  {
    code: 'health_context',
    rules: [
      // No history in V1, on any field. The documentation says so literally.
      ...['context_type', 'description', 'body_area', 'provenance', 'valid_from', 'valid_to'].map(
        (field): Rule => ({
          resource: 'identity.health_context_claims',
          field,
          data_classification_code: 'health',
          max_action: 'read',
        }),
      ),
      // Pain or a limitation the coach notes on a session is health context, written and read
      // only under this permission, whatever the session's own category.
      {
        resource: 'execution.professional_observations',
        field: '*',
        data_classification_code: 'health',
        max_action: 'contribute',
      },
      denied('identity.body_progress_records', 'body'),
    ],
  },
  {
    code: 'nutrition_intake',
    rules: [
      ...['occurred_at', 'timezone', 'local_date', 'meal_type', 'note'].map((field): Rule => ({
        resource: 'nutrition.meals',
        field,
        data_classification_code: 'nutrition',
        max_action: 'read',
      })),
      {
        resource: 'nutrition.meal_items',
        field: '*',
        data_classification_code: 'nutrition',
        max_action: 'read',
      },
      {
        resource: 'nutrition.meal_nutrient_values',
        field: '*',
        data_classification_code: 'nutrition',
        max_action: 'read',
      },
      // The photo has a permission of its own, and never reveals a meal by itself.
      denied('nutrition.meals', 'nutrition', 'media_ref'),
      denied('nutrition.meals', 'nutrition', 'has_media'),
    ],
  },
  {
    code: 'nutrition_guidance',
    rules: [
      // Her goals: each version with its targets, its rationale and author, and what she
      // decided. `read`: nothing lets a professional propose one yet.
      ...[
        'nutrition.goal_sets',
        'nutrition.goal_versions',
        'nutrition.goal_targets',
        'nutrition.goal_decisions',
      ].map((resource): Rule => ({
        resource,
        field: '*',
        data_classification_code: 'nutrition',
        max_action: 'read',
      })),
      denied('nutrition.meals', 'nutrition'),
      denied('nutrition.meal_items', 'nutrition'),
    ],
  },
  {
    code: 'nutrition_media',
    rules: [
      {
        resource: 'nutrition.meals',
        field: 'media_ref',
        data_classification_code: 'nutrition',
        max_action: 'read',
      },
      denied('nutrition.meal_items', 'nutrition'),
      denied('nutrition.meal_nutrient_values', 'nutrition'),
    ],
  },
]

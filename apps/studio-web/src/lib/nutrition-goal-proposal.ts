/**
 * Proposing a client her nutrition goals: `HU-STUDIO-071`.
 *
 * `OP-NUT-012` decides everything that matters, in PostgreSQL. This module keeps
 * the form from sending what the contract refuses, keeps the screen from offering
 * what the command would refuse, and says the refusals it cannot prevent in words
 * the reader can act on.
 *
 * **Six rows, not a list that grows.** The contract closes the nutrients to six,
 * each with a fixed unit, and allows one target per nutrient. So the form is six
 * optional rows and the unit is never chosen. A target is a nutrient, never a
 * food or a menu (criterion 5): there is nowhere to write one.
 *
 * **Every key, always.** The schema requires the six keys of a target, so a
 * minimum sends `maximum: null` and `exact: null` explicitly. A missing key is a
 * 400, not a null.
 *
 * **Three conditions, seen before sending** (criterion 1). The capability, read
 * from the role catalogue as every screen does; a nutrition credential verified
 * and in force, which `/studio/v1/me` already says; and her guidance shared at
 * `contribute`, which her card says. Each refusal is still said apart, because
 * the reader can act on some and not on others. A paused service is seen by no
 * read a coach has, so it can only be explained after the refusal.
 */
import type {
  AccessLevel,
  ClientCardSection,
  NutritionGoalStatus,
  OrganizationRole,
  ProfessionalCredential,
  ProfessionalNutritionGoalVersionCreate,
} from './studio-api'

type GoalTarget = ProfessionalNutritionGoalVersionCreate['targets'][number]

// Energy and the macros first, as every nutrient reads in Studio.
export const GOAL_NUTRIENTS = [
  { code: 'energy', unit: 'kcal' },
  { code: 'protein', unit: 'g' },
  { code: 'carbohydrates', unit: 'g' },
  { code: 'fat', unit: 'g' },
  { code: 'fiber', unit: 'g' },
  { code: 'water', unit: 'ml' },
] as const

export type GoalNutrient = (typeof GOAL_NUTRIENTS)[number]['code']

export type DraftMode = 'none' | 'minimum' | 'maximum' | 'range' | 'exact'

/** What was typed, kept as typed: `low` is a minimum or the exact value, `high` a maximum. */
export interface TargetDraft {
  mode: DraftMode
  low: string
  high: string
}

export interface ProposalDraft {
  targets: Record<GoalNutrient, TargetDraft>
  rationale: string
}

export const RATIONALE_LIMIT = 2000

export const MODE_OPTIONS: readonly { value: DraftMode; label: string }[] = [
  { value: 'none', label: 'Sin objetivo' },
  { value: 'minimum', label: 'Al menos' },
  { value: 'maximum', label: 'Como máximo' },
  { value: 'range', label: 'Entre' },
  { value: 'exact', label: 'Exactamente' },
]

export function emptyProposalDraft(): ProposalDraft {
  const none = (): TargetDraft => ({ mode: 'none', low: '', high: '' })
  return {
    targets: {
      energy: none(),
      protein: none(),
      carbohydrates: none(),
      fat: none(),
      fiber: none(),
      water: none(),
    },
    rationale: '',
  }
}

/** What the select answers, read back as one of its own modes. */
export function draftMode(value: string | null): DraftMode {
  return MODE_OPTIONS.find((option) => option.value === value)?.value ?? 'none'
}

export type DraftField = 'low' | 'high'

/** Which typed field a mode reads, so the screen draws only those. */
export function draftFields(mode: DraftMode): readonly DraftField[] {
  if (mode === 'range') return ['low', 'high']
  if (mode === 'maximum') return ['high']
  if (mode === 'none') return []
  return ['low']
}

/** What a field holds, in the words of the select beside it. */
export function amountCaption(mode: DraftMode, field: DraftField): string {
  if (mode === 'range') return field === 'low' ? 'desde' : 'hasta'
  if (mode === 'minimum') return 'al menos'
  if (mode === 'maximum') return 'como máximo'
  return 'exactamente'
}

export type TargetProblem = 'missing' | 'invalid' | 'reversed'
export type RationaleProblem = 'missing' | 'too-long'

export interface ProposalProblems {
  noTargets: boolean
  targets: Partial<Record<GoalNutrient, TargetProblem>>
  rationale: RationaleProblem | null
}

const PLAIN_NUMBER = /^\d+(?:[.,]\d+)?$/

/** A plain number of at least zero, with a point or a comma for decimals. */
function amount(text: string): number | null {
  const typed = text.trim()
  return PLAIN_NUMBER.test(typed) ? Number(typed.replace(',', '.')) : null
}

function targetProblem(target: TargetDraft): TargetProblem | null {
  const fields = draftFields(target.mode)
  if (fields.some((field) => target[field].trim() === '')) return 'missing'
  if (fields.some((field) => amount(target[field]) === null)) return 'invalid'
  if (target.mode === 'range') {
    const low = amount(target.low)
    const high = amount(target.high)
    if (low !== null && high !== null && low > high) return 'reversed'
  }
  return null
}

function rationaleProblem(rationale: string): RationaleProblem | null {
  const reason = rationale.trim()
  if (reason === '') return 'missing'
  return reason.length > RATIONALE_LIMIT ? 'too-long' : null
}

/** Null when the proposal can be sent as it stands. */
export function proposalProblems(draft: ProposalDraft): ProposalProblems | null {
  const targets: Partial<Record<GoalNutrient, TargetProblem>> = {}
  for (const { code } of GOAL_NUTRIENTS) {
    const problem = targetProblem(draft.targets[code])
    if (problem) targets[code] = problem
  }
  const noTargets = GOAL_NUTRIENTS.every(({ code }) => draft.targets[code].mode === 'none')
  const rationale = rationaleProblem(draft.rationale)
  if (!noTargets && rationale === null && Object.keys(targets).length === 0) return null
  return { noTargets, targets, rationale }
}

export function targetProblemText(problem: TargetProblem, mode: DraftMode): string {
  if (problem === 'reversed') return '«Hasta» no puede ser menor que «Desde».'
  if (problem === 'invalid') return 'Escribe solo el número, sin la unidad.'
  return mode === 'range' ? 'Escribe los dos valores.' : 'Escribe el valor.'
}

export function rationaleProblemText(problem: RationaleProblem): string {
  return problem === 'missing'
    ? 'Escribe por qué se lo propones: ella lo lee con la propuesta.'
    : 'Puedes escribir hasta 2.000 caracteres.'
}

type ModeValues =
  | { mode: 'minimum'; minimum: number; maximum: null; exact: null }
  | { mode: 'maximum'; minimum: null; maximum: number; exact: null }
  | { mode: 'range'; minimum: number; maximum: number; exact: null }
  | { mode: 'exact'; minimum: null; maximum: null; exact: number }

function modeValues(target: TargetDraft): ModeValues | null {
  const low = amount(target.low)
  const high = amount(target.high)
  if (target.mode === 'minimum' && low !== null) {
    return { mode: 'minimum', minimum: low, maximum: null, exact: null }
  }
  if (target.mode === 'maximum' && high !== null) {
    return { mode: 'maximum', minimum: null, maximum: high, exact: null }
  }
  if (target.mode === 'range' && low !== null && high !== null) {
    return { mode: 'range', minimum: low, maximum: high, exact: null }
  }
  if (target.mode === 'exact' && low !== null) {
    return { mode: 'exact', minimum: null, maximum: null, exact: low }
  }
  return null
}

// Each nutrient with its own unit: the contract pairs them, and so must the body.
function goalTarget(code: GoalNutrient, values: ModeValues): GoalTarget {
  switch (code) {
    case 'energy':
      return { nutrient_code: code, unit: 'kcal', ...values }
    case 'water':
      return { nutrient_code: code, unit: 'ml', ...values }
    default:
      return { nutrient_code: code, unit: 'g', ...values }
  }
}

/** The body `OP-NUT-012` takes. Meant for a draft `proposalProblems` found nothing in. */
export function proposalBody(draft: ProposalDraft): ProfessionalNutritionGoalVersionCreate {
  return {
    rationale: draft.rationale.trim(),
    targets: GOAL_NUTRIENTS.flatMap(({ code }) => {
      const values = modeValues(draft.targets[code])
      return values ? [goalTarget(code, values)] : []
    }),
  }
}

const GUIDE_NUTRITION = 'guide_nutrition'
const NUTRITION_CREDENTIAL = 'nutrition_professional'

export function canGuideNutrition(
  roles: readonly string[],
  catalog: readonly OrganizationRole[] | undefined,
): boolean {
  if (!catalog?.length) return false
  return roles.some((role) =>
    catalog
      .find((entry) => entry.code === role)
      ?.capabilities.some((capability) => capability.code === GUIDE_NUTRITION),
  )
}

/** `effective` is the verification the database counts today, not only a verified one. */
export function holdsNutritionCredential(
  credentials: readonly ProfessionalCredential[] | undefined,
): boolean {
  return (credentials ?? []).some(
    (credential) =>
      credential.credential_type_code === NUTRITION_CREDENTIAL && credential.verification.effective,
  )
}

export function guidanceLevel(sections: readonly ClientCardSection[]): AccessLevel | null {
  return (
    sections.find((section) => section.scope_code === 'nutrition_guidance')?.access_level ?? null
  )
}

export type ProposalBlocker = 'role' | 'credential' | 'scope'

export function proposalBlockers(conditions: {
  canGuide: boolean
  credential: boolean
  level: AccessLevel | null
}): ProposalBlocker[] {
  const blockers: ProposalBlocker[] = []
  if (!conditions.canGuide) blockers.push('role')
  if (!conditions.credential) blockers.push('credential')
  if (conditions.level !== 'contribute') blockers.push('scope')
  return blockers
}

/** Each reads after «Para proponerle objetivos te falta». */
export function blockerText(blocker: ProposalBlocker): string {
  if (blocker === 'role') return 'Un rol que oriente nutrición en esta organización.'
  if (blocker === 'credential') {
    return 'Una credencial de nutrición verificada y vigente en tu perfil profesional. La verifica el equipo de Allfit, no esta organización.'
  }
  return 'Que ella te permita contribuir en sus objetivos nutricionales. Hoy solo te deja leerlos.'
}

/** The one a new proposal replaces: a relationship has at most one waiting. */
export function pendingProposal<T extends { status: NutritionGoalStatus }>(
  proposals: readonly T[],
): T | null {
  return proposals.find((proposal) => proposal.status === 'proposed') ?? null
}

/** Criterion 4, said before sending: proposing twice is not offering two options. */
export function replacesLine(createdAt: string): string {
  const day = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(createdAt))
  return `La propuesta del ${day} todavía espera su decisión. Si envías esta, aquella queda reemplazada y ella ya no podrá aceptarla.`
}

export type ProposalRefusal =
  'role' | 'credential' | 'scope' | 'paused' | 'gone' | 'invalid' | 'retry'

export function proposalRefusal(
  status: number | undefined,
  code: string | undefined,
): ProposalRefusal {
  if (status === 403 && code === 'credential-required') return 'credential'
  if (status === 403 && code === 'scope-required') return 'scope'
  if (status === 403) return 'role'
  if (status === 409 && code === 'service-paused') return 'paused'
  if (status === 404) return 'gone'
  if (status === 422) return 'invalid'
  return 'retry'
}

export function proposalRefusalTitle(refusal: ProposalRefusal): string {
  switch (refusal) {
    case 'role':
      return 'Tu rol no orienta nutrición'
    case 'credential':
      return 'Falta tu credencial de nutrición'
    case 'scope':
      return 'Ella no te permite proponerle objetivos'
    case 'paused':
      return 'Su servicio está en pausa'
    case 'gone':
      return 'Ya no la atiendes'
    case 'invalid':
      return 'Revisa los objetivos'
    case 'retry':
      return 'No pudimos enviar la propuesta'
  }
}

export function proposalRefusalDescription(refusal: ProposalRefusal): string {
  switch (refusal) {
    case 'role':
      return 'Solo un rol que orienta nutrición puede proponer objetivos. No se creó nada.'
    case 'credential':
      return 'Hace falta una credencial de nutrición verificada y vigente en tu perfil profesional. La verifica el equipo de Allfit. No se creó nada.'
    case 'scope':
      return 'Hoy comparte sus objetivos nutricionales solo para que los leas, o dejó de compartirlos. No se creó nada.'
    case 'paused':
      return 'Mientras su servicio con esta organización esté en pausa no se le pueden proponer objetivos. No se creó nada.'
    case 'gone':
      return 'Ya no eres quien la atiende, o la relación terminó. No se creó nada.'
    case 'invalid':
      return 'Algún valor no es válido para el nutriente. No se creó nada.'
    case 'retry':
      return 'Proponer necesita conexión. Lo que escribiste sigue aquí: vuelve a intentarlo y no se creará dos veces.'
  }
}

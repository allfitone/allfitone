/**
 * Editing a session template's draft: `HU-STUDIO-037`.
 *
 * The draft is one document the server replaces whole on every save, and it
 * validates every step even while the draft is half-written: a target of the
 * wrong family, a negative load or an interval without rounds is refused on a
 * draft just as on a publication. So the screen edits a copy of its own — text
 * in the fields, as typed — and builds the document only when every value is
 * one the server accepts. What it cannot build it says, step by step.
 *
 * The four criteria, and who holds them:
 *
 * 1. **Only the draft is editable.** Published versions have no write route at
 *    all; this file only ever builds a draft.
 * 2. **A draft is never referenced from a program nor assigned.** The
 *    server's: a program position names a published version id, never a draft.
 * 3. **A step's targets fit the declared activity type.** The family comes
 *    from the type's default result contract, which the catalogue read now
 *    names (`activity_family`). The editor offers that family's fields and no
 *    other, and checks it again before sending, because a step may carry a type
 *    of its own.
 * 4. **Two people editing at once: one gets the current state and a warning.**
 *    The save carries the draft's ETag; a stale one is answered `409` with the
 *    draft as it now is, which the screen shows beside the unsaved work.
 *
 * Everything the editor does not offer — a per-step activity type, a superset
 * group, an endurance pace — is read and written back untouched, so opening a
 * draft and saving it never loses what another tool put there.
 */

import type {
  ActivityFamily,
  CatalogActivityType,
  PlannedSetContent,
  PlannedStepContent,
  SessionTemplateDraftContent,
} from './studio-api'

const TITLE_LIMIT = 160
const NOTES_LIMIT = 2000
const REST_LIMIT_SECONDS = 3600
const STEP_LIMIT = 200

export type SetKind = PlannedSetContent['kind']
export type LoadUnit = 'kg' | 'lb'
export type Side = 'left' | 'right' | 'bilateral' | 'not_applicable'

export interface EditorSet {
  kind: SetKind
  reps: string
  load: string
  rpe: string
}

export type EditorTarget =
  | { family: 'strength'; sets: EditorSet[]; loadUnit: LoadUnit; rest: string }
  | {
      family: 'endurance'
      /** Metres: the only distance unit the catalogue carries today. */
      distance: string
      minutes: string
      /** Not offered by the editor; kept as found. */
      pace: { seconds: number; unit: string } | null
    }
  | { family: 'interval'; rounds: string; work: string; rest: string; rpe: string }
  | { family: 'mobility'; hold: string; reps: string; side: Side }

export interface EditorStep {
  /** A key for React, never sent: steps are identified by position on the wire. */
  key: string
  movementId: string | null
  /** A type of the step's own, for hybrid templates. Kept, not offered. */
  activityTypeId: string | null
  notes: string
  /** Kept, not offered. `IX-46` checks the chain at publication. */
  supersetGroup: number | null
  target: EditorTarget
}

export interface EditorDraft {
  title: string
  activityTypeId: string | null
  steps: EditorStep[]
}

export interface DraftProblems {
  draft: string[]
  steps: Record<string, string[]>
}

export type BuildResult = { content: SessionTemplateDraftContent } | { problems: DraftProblems }

export const FAMILY_LABEL: Record<ActivityFamily, string> = {
  strength: 'fuerza',
  endurance: 'resistencia',
  interval: 'intervalos',
  mobility: 'movilidad',
}

export const SET_KIND_LABEL: Record<SetKind, string> = {
  normal: 'Normal',
  warmup: 'Calentamiento',
  to_failure: 'Al fallo',
  drop: 'Descendente',
}

export const SIDE_LABEL: Record<Side, string> = {
  bilateral: 'Ambos lados',
  left: 'Izquierdo',
  right: 'Derecho',
  not_applicable: 'No aplica',
}

// ------------------------------------------------------------ activity types

export function familyOf(
  activityTypeId: string | null,
  activityTypes: readonly CatalogActivityType[],
): ActivityFamily | null {
  if (!activityTypeId) return null
  return activityTypes.find((type) => type.id === activityTypeId)?.activity_family ?? null
}

/** The family a step's targets must have: its own type's, or the template's. */
export function stepFamily(
  step: EditorStep,
  draft: EditorDraft,
  activityTypes: readonly CatalogActivityType[],
): ActivityFamily | null {
  return familyOf(step.activityTypeId ?? draft.activityTypeId, activityTypes)
}

/**
 * The types the template may declare: its discipline's, by name. A type with no
 * family cannot hold a step, and once steps exist only the same family is
 * offered, because changing it would make every step's target the wrong kind.
 */
export function activityTypeChoices(
  activityTypes: readonly CatalogActivityType[],
  disciplineCode: string,
  steps: readonly EditorStep[],
): Array<{ value: string; label: string; disabled: boolean }> {
  const inherited = steps.filter((step) => step.activityTypeId === null)
  const lockedFamily = inherited.length > 0 ? inherited[0]?.target.family : undefined
  return activityTypes
    .filter((type) => type.discipline_code === disciplineCode)
    .toSorted((left, right) => left.name.localeCompare(right.name, 'es'))
    .map((type) => ({
      value: type.id,
      label: type.activity_family
        ? `${type.name} · ${FAMILY_LABEL[type.activity_family]}`
        : `${type.name} · sin objetivos disponibles`,
      disabled:
        type.activity_family === null ||
        (lockedFamily !== undefined && type.activity_family !== lockedFamily),
    }))
}

// ------------------------------------------------------------------ reading

export function emptyTarget(family: ActivityFamily): EditorTarget {
  if (family === 'strength') {
    return {
      family,
      sets: [{ kind: 'normal', reps: '', load: '', rpe: '' }],
      loadUnit: 'kg',
      rest: '',
    }
  }
  if (family === 'endurance') return { family, distance: '', minutes: '', pace: null }
  if (family === 'interval') return { family, rounds: '', work: '', rest: '', rpe: '' }
  return { family, hold: '', reps: '', side: 'not_applicable' }
}

export function editorFromContent(
  content: SessionTemplateDraftContent,
  newKey: () => string,
): EditorDraft {
  return {
    title: content.title,
    activityTypeId: content.activity_type_id,
    steps: content.steps
      .toSorted((left, right) => left.position - right.position)
      .map((step) => ({
        key: newKey(),
        movementId: step.movement_id ?? null,
        activityTypeId: step.activity_type_id ?? null,
        notes: step.notes ?? '',
        supersetGroup: step.superset_group ?? null,
        target: targetFromContent(step.target),
      })),
  }
}

function targetFromContent(target: PlannedStepContent['target']): EditorTarget {
  if (target.family === 'strength') {
    // An older draft carries only the aggregate; publication synthesises the
    // same rows from it, so the editor shows them as sets too.
    const sets: EditorSet[] = target.sets?.length
      ? target.sets
          .toSorted((left, right) => left.set_order - right.set_order)
          .map((set) => ({
            kind: set.kind,
            reps: text(set.target_reps),
            load: text(set.target_load_value),
            rpe: text(set.target_rpe),
          }))
      : Array.from({ length: Math.max(1, target.target_sets ?? 1) }, () => ({
          kind: 'normal' as const,
          reps: text(target.target_reps),
          load: text(target.target_load_value),
          rpe: text(target.target_rpe),
        }))
    const unit =
      target.sets?.find((set) => set.target_load_unit_code)?.target_load_unit_code ??
      target.target_load_unit_code
    return {
      family: 'strength',
      sets,
      loadUnit: unit === 'lb' ? 'lb' : 'kg',
      rest: text(target.target_rest_seconds),
    }
  }
  if (target.family === 'endurance') {
    const seconds = target.target_duration_seconds
    return {
      family: 'endurance',
      distance: text(target.target_distance_value),
      minutes: seconds ? text(seconds / 60) : '',
      pace:
        target.target_pace_seconds_per_unit && target.target_pace_unit_code
          ? { seconds: target.target_pace_seconds_per_unit, unit: target.target_pace_unit_code }
          : null,
    }
  }
  if (target.family === 'interval') {
    return {
      family: 'interval',
      rounds: text(target.rounds),
      work: text(target.work_duration_seconds),
      rest: text(target.rest_duration_seconds),
      rpe: text(target.target_rpe),
    }
  }
  return {
    family: 'mobility',
    hold: text(target.hold_duration_seconds),
    reps: text(target.target_repetitions),
    side: target.side,
  }
}

function text(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

// ------------------------------------------------------------------ editing

export function addStep(
  draft: EditorDraft,
  activityTypes: readonly CatalogActivityType[],
  newKey: () => string,
): EditorStep[] {
  const family = familyOf(draft.activityTypeId, activityTypes)
  if (!family || draft.steps.length >= STEP_LIMIT) return draft.steps
  return [
    ...draft.steps,
    {
      key: newKey(),
      movementId: null,
      activityTypeId: null,
      notes: '',
      supersetGroup: null,
      target: emptyTarget(family),
    },
  ]
}

export function removeStep(steps: readonly EditorStep[], key: string): EditorStep[] {
  return steps.filter((step) => step.key !== key)
}

export function moveStep(steps: readonly EditorStep[], index: number, delta: -1 | 1): EditorStep[] {
  const target = index + delta
  if (target < 0 || target >= steps.length) return [...steps]
  const next = [...steps]
  const [moved] = next.splice(index, 1)
  if (moved) next.splice(target, 0, moved)
  return next
}

// ----------------------------------------------------------------- building

type Parsed = { ok: true; value: number | null } | { ok: false }

/** A whole number from `min`, or nothing when the field is empty. */
function parseCount(raw: string, min: number, max = 2147483647): Parsed {
  const value = raw.trim()
  if (!value) return { ok: true, value: null }
  if (!/^\d+$/.test(value)) return { ok: false }
  const number = Number(value)
  return number >= min && number <= max ? { ok: true, value: number } : { ok: false }
}

/** A decimal, typed with a comma or a point, within the bounds given. */
function parseAmount(raw: string, check: (value: number) => boolean): Parsed {
  const value = raw.trim().replace(',', '.')
  if (!value) return { ok: true, value: null }
  if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false }
  const number = Number(value)
  return check(number) ? { ok: true, value: number } : { ok: false }
}

const positive = (value: number) => value > 0
const nonNegative = (value: number) => value >= 0
const effort = (value: number) => value >= 0 && value <= 10

export function buildDraftContent(
  draft: EditorDraft,
  activityTypes: readonly CatalogActivityType[],
): BuildResult {
  const problems: DraftProblems = { draft: [], steps: {} }
  const title = draft.title.trim()
  if (!title) problems.draft.push('Escribe el nombre de la plantilla.')
  else if (title.length > TITLE_LIMIT) problems.draft.push('El nombre admite hasta 160 caracteres.')

  const steps: PlannedStepContent[] = []
  draft.steps.forEach((step, index) => {
    const messages: string[] = []
    const expected = stepFamily(step, draft, activityTypes)
    if (expected !== step.target.family) {
      messages.push(
        expected
          ? `Este paso lleva objetivos de ${FAMILY_LABEL[expected]}, por su tipo de actividad.`
          : 'Elige un tipo de actividad con objetivos disponibles antes de escribir pasos.',
      )
    }
    if (step.notes.length > NOTES_LIMIT) messages.push('Las notas admiten hasta 2000 caracteres.')
    const target = buildTarget(step.target, index + 1, messages)
    if (messages.length > 0 || !target) {
      problems.steps[step.key] = messages
      return
    }
    steps.push({
      position: index + 1,
      movement_id: step.movementId,
      activity_type_id: step.activityTypeId,
      notes: step.notes.trim() ? step.notes : null,
      superset_group: step.supersetGroup,
      target,
    })
  })

  if (problems.draft.length > 0 || Object.keys(problems.steps).length > 0) return { problems }
  return { content: { title, activity_type_id: draft.activityTypeId, steps } }
}

function buildTarget(
  target: EditorTarget,
  position: number,
  messages: string[],
): PlannedStepContent['target'] | undefined {
  if (target.family === 'strength') {
    const sets: PlannedSetContent[] = []
    target.sets.forEach((set, index) => {
      const label = `Serie ${index + 1}`
      const reps = parseCount(set.reps, 1)
      const load = parseAmount(set.load, nonNegative)
      const rpe = parseAmount(set.rpe, effort)
      if (!reps.ok) messages.push(`${label}: las repeticiones son un número entero desde 1.`)
      if (!load.ok) messages.push(`${label}: la carga es un número desde 0.`)
      if (!rpe.ok) messages.push(`${label}: el esfuerzo percibido va de 0 a 10.`)
      if (!reps.ok || !load.ok || !rpe.ok) return
      sets.push({
        set_order: index + 1,
        kind: set.kind,
        // «Until you cannot» and «until eight» are different instructions.
        target_reps: set.kind === 'to_failure' ? null : reps.value,
        target_load_value: load.value,
        target_load_unit_code: load.value === null ? null : target.loadUnit,
        target_rpe: rpe.value,
      })
    })
    if (target.sets.length === 0) messages.push('Agrega al menos una serie.')
    const rest = parseCount(target.rest, 0, REST_LIMIT_SECONDS)
    if (!rest.ok) messages.push('El descanso entre series va de 0 a 3600 segundos.')
    if (messages.length > 0 || !rest.ok) return undefined
    return { family: 'strength', sets, target_rest_seconds: rest.value }
  }

  if (target.family === 'endurance') {
    const distance = parseAmount(target.distance, positive)
    const minutes = parseAmount(target.minutes, positive)
    if (!distance.ok) messages.push('La distancia es un número de metros mayor que 0.')
    if (!minutes.ok) messages.push('La duración es un número de minutos mayor que 0.')
    if (!distance.ok || !minutes.ok) return undefined
    const pace = {
      target_pace_seconds_per_unit: target.pace?.seconds ?? null,
      target_pace_unit_code: target.pace?.unit ?? null,
    }
    if (distance.value !== null) {
      return {
        family: 'endurance',
        target_distance_value: distance.value,
        target_distance_unit_code: 'm',
        target_duration_seconds: minutes.value === null ? null : Math.round(minutes.value * 60),
        ...pace,
      }
    }
    if (minutes.value !== null) {
      return {
        family: 'endurance',
        target_distance_value: null,
        target_distance_unit_code: null,
        target_duration_seconds: Math.round(minutes.value * 60),
        ...pace,
      }
    }
    messages.push('Indica una distancia o una duración.')
    return undefined
  }

  if (target.family === 'interval') {
    const rounds = parseCount(target.rounds, 1)
    const work = parseAmount(target.work, positive)
    const rest = parseAmount(target.rest, nonNegative)
    const rpe = parseAmount(target.rpe, effort)
    if (!rounds.ok || rounds.value === null) messages.push('Indica las rondas, desde 1.')
    if (!work.ok || work.value === null) messages.push('Indica los segundos de trabajo, más de 0.')
    if (!rest.ok) messages.push('El descanso es un número de segundos desde 0.')
    if (!rpe.ok) messages.push('El esfuerzo percibido va de 0 a 10.')
    if (!rounds.ok || rounds.value === null || !work.ok || work.value === null) return undefined
    if (!rest.ok || !rpe.ok) return undefined
    return {
      family: 'interval',
      rounds: rounds.value,
      work_duration_seconds: work.value,
      rest_duration_seconds: rest.value,
      target_rpe: rpe.value,
    }
  }

  const hold = parseAmount(target.hold, positive)
  const reps = parseCount(target.reps, 1)
  if (!hold.ok) messages.push('El tiempo sostenido es un número de segundos mayor que 0.')
  if (!reps.ok) messages.push('Las repeticiones son un número entero desde 1.')
  if (!hold.ok || !reps.ok) return undefined
  // The position in the session, which is what a mobility sequence follows.
  const base = { family: 'mobility' as const, sequence_position: position, side: target.side }
  if (hold.value !== null) {
    return { ...base, hold_duration_seconds: hold.value, target_repetitions: reps.value }
  }
  if (reps.value !== null) {
    return { ...base, hold_duration_seconds: null, target_repetitions: reps.value }
  }
  messages.push('Indica un tiempo sostenido o unas repeticiones.')
  return undefined
}

// ---------------------------------------------------------------- answering

/**
 * The codes `planning.session_content_errors` and `program_content_errors`
 * raise, in the reader's words. The API's own messages are English and meant
 * for logs.
 */
const ISSUE_MESSAGE: Record<string, string> = {
  title: 'El nombre está vacío o es demasiado largo.',
  'activity-type': 'El tipo de actividad ya no está publicado o no es de la disciplina.',
  steps: 'La plantilla necesita al menos un paso.',
  'step-shape': 'Un paso tiene una forma que el servidor no reconoce.',
  'target-family': 'Un objetivo no corresponde al tipo de actividad de su paso.',
  movement: 'Un movimiento ya no está disponible o no es de la disciplina de la plantilla.',
  'step-notes': 'Unas notas superan los 2000 caracteres.',
  'superset-group': 'Una superserie tiene un número que no es válido.',
  'strength-target': 'Un objetivo de fuerza tiene un valor que no es válido.',
  'planned-set': 'Una serie tiene un valor que no es válido.',
  'planned-set-order': 'Las series de un paso tienen que ir numeradas en orden.',
  'endurance-target': 'Un objetivo de resistencia necesita una distancia o una duración válidas.',
  'interval-target': 'Un objetivo de intervalos necesita rondas y segundos de trabajo válidos.',
  'mobility-target': 'Un objetivo de movilidad necesita un tiempo sostenido o repeticiones.',
  'duplicate-step-position': 'Dos pasos tienen la misma posición.',
  'invalid-content-value': 'El borrador tiene un valor que el servidor no pudo leer.',
  'invalid-content-shape': 'El borrador tiene una forma que el servidor no reconoce.',
}

export function saveIssueMessages(codes: readonly string[]): string[] {
  return [...new Set(codes)].map(
    (code) => ISSUE_MESSAGE[code] ?? `El servidor rechazó un valor del borrador (${code}).`,
  )
}

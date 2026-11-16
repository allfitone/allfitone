/**
 * What summarising a week means to Allfit, in Allfit's words (ADR-053).
 *
 * A person asks for the summary of one of her weeks. The database reads what she logged
 * in that week and in the one before (`WeeksLogged`); this package turns it into the one
 * thing a model is shown (`WeekDocument`) and holds the model's answer to it
 * (`WeeklySummary`).
 *
 * - **`WeekDocument` is the context contract** (ADR-053, decision 6), and `CONTRACT` is
 *   its version. A field that is not in it does not reach a model, whatever the database
 *   read. It holds no name, no email, no phone, no photo and no identifier: the model is
 *   told about «the person».
 * - **What the owner approved for this version** (16 November 2026): her sessions of the
 *   week and of the week before, with their exercises, sets, loads and duration; her daily
 *   totals of energy, protein, carbohydrates and fat; and her active nutrition goal. No
 *   notes, no session titles, no body measures and no health context.
 * - **Every number is computed here, never by the model.** A total, an average or a
 *   difference the summary may state is already in the document, so a number in the
 *   answer that is not in the document is an invented one (`numbers.ts`).
 *
 * The port test from AGENTS.md: a summariser for any vendor could be written without
 * touching this file.
 */

/** The version of the context contract a run records (ADR-053, decision 6). */
export const CONTRACT = 'weekly-summary/1'

export const LANGUAGES = ['es', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

// ———————————————————————————————————————— what the database read

/** One exercise of a session: its work sets, without warm-ups. */
export interface ExerciseLogged {
  /** Groups the same exercise across sessions. It never reaches the model. */
  readonly movementId: string | null
  readonly name: string
  readonly workSets: number
  /** Its best set by estimated maximum; null when nothing was weighed. */
  readonly bestSet: { readonly loadKg: number; readonly reps: number } | null
  /** Null when nothing was weighed: not zero lifted. */
  readonly volumeKg: number | null
  /** Whether the person beat a mark of her own in it that day. */
  readonly record: boolean
}

export interface SessionLogged {
  /** The day she trained, in her own time zone. */
  readonly trainedOn: string
  readonly durationSeconds: number
  readonly exercises: readonly ExerciseLogged[]
}

export interface NutritionDayLogged {
  readonly date: string
  readonly meals: number
  /** A nutrient nobody wrote has no total: null, not zero. */
  readonly energyKcal: number | null
  readonly proteinG: number | null
  readonly carbohydratesG: number | null
  readonly fatG: number | null
}

export const GOAL_NUTRIENTS = ['energy', 'protein', 'carbohydrates', 'fat'] as const
export type GoalNutrient = (typeof GOAL_NUTRIENTS)[number]

/** One target of her active nutrition goal; which bounds it has depends on its mode. */
export interface GoalTarget {
  readonly nutrient: GoalNutrient
  readonly minimum: number | null
  readonly maximum: number | null
  readonly exact: number | null
}

export interface WeeksLogged {
  /** The Monday of the week being summarised. The week before starts seven days earlier. */
  readonly weekStartsOn: string
  /** True while that week has not ended in her time zone. */
  readonly inProgress: boolean
  /** Sessions of both weeks, finished and standing. */
  readonly sessions: readonly SessionLogged[]
  /** Days of both weeks on which she recorded at least one meal. */
  readonly nutritionDays: readonly NutritionDayLogged[]
  readonly goal: readonly GoalTarget[]
}

// ———————————————————————————————————————— what a model is shown

export interface TrainingTotals {
  readonly sessions: number
  readonly days_trained: number
  readonly minutes: number
  readonly work_sets: number
  /** Kilograms moved in work sets; null when nothing was weighed. */
  readonly volume_kg: number | null
}

export interface ExerciseInSession {
  readonly name: string
  readonly work_sets: number
  readonly best_set: { readonly kg: number; readonly reps: number } | null
  readonly personal_record: boolean
}

export interface ExerciseCompared {
  readonly name: string
  readonly best_kg: number
  readonly best_kg_week_before: number
  /** `best_kg` minus `best_kg_week_before`, already computed. */
  readonly change_kg: number
}

export interface NutritionAverages {
  readonly days_logged: number
  readonly kcal_per_day: number | null
  readonly protein_g_per_day: number | null
  readonly carbohydrates_g_per_day: number | null
  readonly fat_g_per_day: number | null
}

export interface GoalInDocument {
  readonly nutrient: GoalNutrient
  readonly unit: 'kcal' | 'g'
  readonly minimum: number | null
  readonly maximum: number | null
  readonly exact: number | null
  /**
   * Logged days of the week inside the bounds, already counted. Null for an exact
   * target: no rule says how near is near enough, and the summary must not make one up.
   */
  readonly days_met: number | null
}

/** This week minus the week before, already subtracted; null where either side is unknown. */
export interface TrainingChange {
  readonly sessions: number
  readonly minutes: number
  readonly work_sets: number
  readonly volume_kg: number | null
}

export interface NutritionChange {
  readonly kcal_per_day: number | null
  readonly protein_g_per_day: number | null
  readonly carbohydrates_g_per_day: number | null
  readonly fat_g_per_day: number | null
}

export interface WeekDocument {
  readonly language: Language
  readonly week: {
    readonly from: string
    readonly to: string
    /** Always seven. It is stated so a summary may say «6 of 7 days». */
    readonly days: 7
    /** True when the week has not ended: the summary says «so far». */
    readonly in_progress: boolean
  }
  /** Null when she logged no session that week: the summary then says nothing of training. */
  readonly training: {
    readonly this_week: TrainingTotals
    /** Null when she logged no session the week before. */
    readonly week_before: TrainingTotals | null
    /** Null exactly when `week_before` is. */
    readonly change: TrainingChange | null
    readonly sessions: readonly {
      readonly date: string
      readonly weekday: string
      readonly minutes: number
      readonly exercises: readonly ExerciseInSession[]
    }[]
    /** Exercises weighed in both weeks, with the difference between their best loads. */
    readonly compared: readonly ExerciseCompared[]
  } | null
  /** Null when she recorded no meal that week: the summary then says nothing of nutrition. */
  readonly nutrition: {
    readonly this_week: NutritionAverages
    /** Null when she recorded no meal the week before. */
    readonly week_before: NutritionAverages | null
    /** Null exactly when `week_before` is. */
    readonly change: NutritionChange | null
    readonly days: readonly {
      readonly date: string
      readonly weekday: string
      readonly kcal: number | null
      readonly protein_g: number | null
      readonly carbohydrates_g: number | null
      readonly fat_g: number | null
    }[]
    /** Empty when she has no active goal. */
    readonly goal: readonly GoalInDocument[]
  } | null
}

/** Which of her data a summary was written from: what the app shows under it. */
export const SOURCES = ['training', 'nutrition', 'nutrition_goal'] as const
export type Source = (typeof SOURCES)[number]

// ———————————————————————————————————————— what comes back

export interface WeeklySummary {
  /** One or two sentences on the week as a whole. */
  readonly overview: string
  /** Null exactly when the document has no training. */
  readonly training: string | null
  /** Null exactly when the document has no nutrition. */
  readonly nutrition: string | null
  /** What changed against the week before; null exactly when there is nothing to compare. */
  readonly changes: string | null
}

export interface Summarised {
  readonly summary: WeeklySummary
  /** The exact model that wrote it, route included (ADR-018). */
  readonly model: string
  /** Null when the vendor did not count. */
  readonly tokens: { readonly input: number; readonly output: number } | null
}

/**
 * - `unavailable`: the model did not answer, or could not be asked; later may work.
 * - `refused`: it answered, and the answer may not be shown: the wrong shape, a number
 *   the week does not have, or a part about something she did not log.
 */
export type SummaryFailure = 'unavailable' | 'refused'

/** The rule a refused answer broke (`validate.ts`). */
export const REFUSALS = [
  'shape',
  'empty',
  'too-long',
  'part-not-logged',
  'part-missing',
  'link',
  'markup',
  'medical',
  'unknown-number',
  'proportion',
] as const
export type RefusalReason = (typeof REFUSALS)[number]

/**
 * It says which rule was broken and never what the answer said: a summary is about a
 * person's week, and an error can reach a log.
 */
export class SummaryError extends Error {
  readonly failure: SummaryFailure
  /** Null when the model did not answer. */
  readonly reason: RefusalReason | null
  /** What the failed request consumed, when the vendor had already counted it. */
  readonly tokens: Summarised['tokens']

  constructor(
    failure: SummaryFailure,
    options: {
      readonly reason?: RefusalReason | undefined
      readonly cause?: unknown
      readonly tokens?: Summarised['tokens'] | undefined
    } = {},
  ) {
    const reason = options.reason ?? null
    super(`weekly summary failed: ${failure}${reason ? `: ${reason}` : ''}`, {
      cause: options.cause,
    })
    this.name = 'SummaryError'
    this.failure = failure
    this.reason = reason
    this.tokens = options.tokens ?? null
  }
}

export interface WeeklySummarizer {
  /** The exact model it asks, as a run records it before the answer is known. */
  readonly model: string
  /** Fails closed with `SummaryError`; a made-up summary is never an answer. */
  summarize(document: WeekDocument, signal?: AbortSignal): Promise<Summarised>
}

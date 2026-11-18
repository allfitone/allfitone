/**
 * The weekly summary of Space, for the person herself (HU-SP-126, HU-SP-127; ADR-053).
 *
 * **Asking is two transactions with the model between them.** PostgreSQL decides first,
 * under her own lock: her plan, her consent in force, her ceiling. Only then does it read
 * her two weeks and open a run. The model is asked with no transaction open, and a second
 * transaction closes the run and keeps what it wrote. Whatever happens after a run opens,
 * this layer closes it: a run left open would hold a place under her ceiling.
 *
 * **Nothing is made up.** When the model does not answer, or its answer breaks a rule of
 * the package that checks it, the run ends as a failure and she is told the summary is
 * unavailable. What a refused answer said is never kept and never logged; the run keeps
 * its cost, and the caller learns which rule it broke.
 *
 * **Without a model the capability is closed**, and it is closed before anything is
 * decided or read. Listing and deleting her summaries need no model and no consent: they
 * are hers.
 */

import {
  CONTRACT,
  SummaryError,
  documentOf,
  sourcesOf,
  type Language,
  type Summarised,
  type WeeklySummarizer,
} from '@allfitone/weekly-summary'

import {
  SummaryCeilingReached,
  SummaryDisposed,
  SummaryUnavailable,
  type IntelligenceCommand,
  type SummaryClosing,
  type SummaryOpening,
  type WeeklySummaryAnswer,
  type WeeklySummaryDatabase,
  type WeeklySummaryList,
} from '../domain/index.js'

export interface WeeklySummaryService {
  requestWeeklySummary(
    input: IntelligenceCommand & {
      personId: string
      weekStartsOn: string
      timezone: string
      language: Language
    },
  ): Promise<WeeklySummaryAnswer>
  listWeeklySummaries(input: {
    personId: string
    before: string | null
    limit: number
    requestId: string
  }): Promise<WeeklySummaryList>
  deleteWeeklySummary(
    input: IntelligenceCommand & { personId: string; weekStartsOn: string },
  ): Promise<void>
}

export function createWeeklySummaryService(
  database: WeeklySummaryDatabase,
  currentConsent: string | null,
  summarizer: WeeklySummarizer | null,
): WeeklySummaryService {
  /** What a request sent again answers: what its run became, without asking anything. */
  async function replay(
    personId: string,
    earlier: Extract<SummaryOpening, { state: 'replayed' }>,
  ): Promise<WeeklySummaryAnswer> {
    if (earlier.outcome === 'nothing-logged') return { outcome: 'nothing-logged', summary: null }
    if (earlier.outcome === 'over-ceiling') throw new SummaryCeilingReached(earlier.renewsAt)
    if (earlier.outcome !== 'answered') throw new SummaryUnavailable(earlier.outcome)

    const summary = await database.readWeeklySummary({
      personId,
      weekStartsOn: earlier.weekStartsOn,
    })
    if (!summary) throw new SummaryDisposed()
    return { outcome: 'summarized', summary }
  }

  return {
    async requestWeeklySummary({ language, ...asked }) {
      if (!summarizer) throw new SummaryUnavailable('closed')

      const opening = await database.beginWeeklySummary({
        ...asked,
        consentVersion: currentConsent,
        contract: CONTRACT,
      })
      if (opening.state === 'over-ceiling') throw new SummaryCeilingReached(opening.renewsAt)
      if (opening.state === 'replayed') return replay(asked.personId, opening)

      const close = (ending: Omit<SummaryClosing, 'personId' | 'runId'>) =>
        database.finishWeeklySummary({ personId: asked.personId, runId: opening.runId, ...ending })

      const document = documentOf(opening.logged, language)
      if (!document) {
        await close({ outcome: 'nothing-logged', model: null, tokens: null, summary: null })
        return { outcome: 'nothing-logged', summary: null }
      }

      let written: Summarised
      try {
        written = await summarizer.summarize(document)
      } catch (cause) {
        const failed = cause instanceof SummaryError ? cause : null
        await close({
          outcome: failed?.failure ?? 'unavailable',
          model: summarizer.model,
          tokens: failed?.tokens ?? null,
          summary: null,
        })
        // Anything but the summariser's own failure is a defect, and stays visible as one.
        if (!failed) throw cause
        throw new SummaryUnavailable(failed.reason ?? failed.failure)
      }

      const kept = await close({
        outcome: 'answered',
        model: written.model,
        tokens: written.tokens,
        summary: { ...written.summary, sources: sourcesOf(document) },
      })
      // Closed meanwhile as abandoned: its answer came too late to be kept or shown.
      if (!kept) throw new SummaryUnavailable('run-closed')
      return { outcome: 'summarized', summary: kept }
    },

    listWeeklySummaries: (input) => database.listWeeklySummaries(input),

    deleteWeeklySummary: (input) => database.deleteWeeklySummary(input),
  }
}

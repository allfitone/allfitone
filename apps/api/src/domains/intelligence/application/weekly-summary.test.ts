import { describe, expect, test } from 'bun:test'
import { createMemorySummarizer, type WeeksLogged } from '@allfitone/weekly-summary'

import {
  ConsentRequired,
  SummaryCeilingReached,
  SummaryDisposed,
  SummaryUnavailable,
  type RunOutcome,
  type SummaryClosing,
  type SummaryOpening,
  type WeeklySummary,
  type WeeklySummaryDatabase,
} from '../domain/index.js'
import { createWeeklySummaryService } from './weekly-summary.js'

const PERSON = '019f1400-0000-7000-8000-000000000001'
const RUN = '019f1400-0000-7000-8000-000000000501'
const WEEK = '2026-11-09'
const RENEWS = '2026-11-23T05:00:00+00:00'
const TEXT = '2026-12-01'
const MODEL = 'bedrock/us.anthropic.claude-test'
const command = {
  idempotencyKey: 'f7111111-1111-4111-8111-111111111501',
  commandId: RUN,
  requestHash: new Uint8Array(32),
}
const asked = {
  personId: PERSON,
  weekStartsOn: WEEK,
  timezone: 'America/Bogota',
  language: 'es' as const,
  ...command,
}

const trained: WeeksLogged = {
  weekStartsOn: WEEK,
  inProgress: false,
  sessions: [
    {
      trainedOn: '2026-11-10',
      durationSeconds: 3300,
      exercises: [
        {
          movementId: '019f5000-0000-7000-8000-000000000001',
          name: 'Sentadilla',
          workSets: 4,
          bestSet: { loadKg: 82.5, reps: 5 },
          volumeKg: 1650,
          record: false,
        },
      ],
    },
  ],
  nutritionDays: [],
  goal: [],
}
const nothingLogged: WeeksLogged = { ...trained, sessions: [] }

const WRITTEN = {
  overview: 'Entrenaste una vez esta semana.',
  training: 'El martes hiciste Sentadilla, con 82,5 kg por 5 repeticiones como mejor serie.',
  nutrition: null,
  changes: null,
}
const kept: WeeklySummary = {
  week_starts_on: WEEK,
  ...WRITTEN,
  sources: ['training'],
  model: MODEL,
  generated_at: '2026-11-16T15:00:00+00:00',
}

const opened = (logged: WeeksLogged): SummaryOpening => ({ state: 'opened', runId: RUN, logged })
const replayed = (outcome: RunOutcome): SummaryOpening => ({
  state: 'replayed',
  outcome,
  weekStartsOn: WEEK,
  renewsAt: RENEWS,
})

function harness(
  opening: SummaryOpening | Error,
  options: { model?: boolean; stored?: WeeklySummary | null; closes?: WeeklySummary | null } = {},
) {
  const begun: unknown[] = []
  const closed: SummaryClosing[] = []
  const read: unknown[] = []
  const listed: unknown[] = []
  const deleted: unknown[] = []
  const database: WeeklySummaryDatabase = {
    beginWeeklySummary: async (input) => {
      begun.push(input)
      if (opening instanceof Error) throw opening
      return opening
    },
    finishWeeklySummary: async (input) => {
      closed.push(input)
      if (input.outcome !== 'answered') return null
      return options.closes === undefined ? kept : options.closes
    },
    readWeeklySummary: async (input) => {
      read.push(input)
      return options.stored === undefined ? kept : options.stored
    },
    listWeeklySummaries: async (input) => {
      listed.push(input)
      return { data: [kept], nextBefore: WEEK }
    },
    deleteWeeklySummary: async (input) => {
      deleted.push(input)
    },
  }
  const summarizer = createMemorySummarizer(MODEL)
  summarizer.answer(WRITTEN, { input: 900, output: 120 })
  const service = createWeeklySummaryService(
    database,
    TEXT,
    options.model === false ? null : summarizer,
  )
  return { service, summarizer, begun, closed, read, listed, deleted }
}

async function refusalOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work
  } catch (cause) {
    return cause
  }
  throw new Error('it was not refused')
}

describe('the weekly summary, as the person asks for it (HU-SP-126; ADR-053)', () => {
  test('T-ITL-API-UNIT-06 a logged week is shown to the model, and what it wrote is kept with its sources and its cost', async () => {
    const { service, summarizer, begun, closed } = harness(opened(trained))

    expect(await service.requestWeeklySummary(asked)).toEqual({
      outcome: 'summarized',
      summary: kept,
    })

    // The database decides under the text in force and the contract the run records.
    expect(begun).toEqual([
      {
        personId: PERSON,
        weekStartsOn: WEEK,
        timezone: 'America/Bogota',
        consentVersion: TEXT,
        contract: 'weekly-summary/1',
        ...command,
      },
    ])
    expect(summarizer.seen).toHaveLength(1)
    expect(summarizer.seen[0]?.language).toBe('es')
    expect(closed).toEqual([
      {
        personId: PERSON,
        runId: RUN,
        outcome: 'answered',
        model: MODEL,
        tokens: { input: 900, output: 120 },
        summary: { ...WRITTEN, sources: ['training'] },
      },
    ])
  })

  test('T-ITL-API-UNIT-07 a week with nothing logged asks no model, and its run says so', async () => {
    const { service, summarizer, closed } = harness(opened(nothingLogged))

    expect(await service.requestWeeklySummary(asked)).toEqual({
      outcome: 'nothing-logged',
      summary: null,
    })
    expect(summarizer.seen).toEqual([])
    expect(closed).toEqual([
      {
        personId: PERSON,
        runId: RUN,
        outcome: 'nothing-logged',
        model: null,
        tokens: null,
        summary: null,
      },
    ])
  })

  test('T-ITL-API-UNIT-08 a model that does not answer closes the run as a failure, and nothing is made up', async () => {
    const { service, summarizer, closed } = harness(opened(trained))
    summarizer.failNext('unavailable')

    const refusal = await refusalOf(service.requestWeeklySummary(asked))

    expect(refusal).toBeInstanceOf(SummaryUnavailable)
    expect((refusal as SummaryUnavailable).reason).toBe('unavailable')
    expect(closed).toEqual([
      {
        personId: PERSON,
        runId: RUN,
        outcome: 'unavailable',
        model: MODEL,
        tokens: null,
        summary: null,
      },
    ])
  })

  test('T-ITL-API-UNIT-09 an answer that may not be shown is refused: the run keeps the rule it broke and what it cost, never the text', async () => {
    const { service, summarizer, closed } = harness(opened(trained))
    // She logged no meal, and the answer speaks of nutrition.
    summarizer.answer(
      { ...WRITTEN, nutrition: 'Comiste bien toda la semana.' },
      { input: 900, output: 150 },
    )

    const refusal = await refusalOf(service.requestWeeklySummary(asked))

    expect(refusal).toBeInstanceOf(SummaryUnavailable)
    expect((refusal as SummaryUnavailable).reason).toBe('part-not-logged')
    expect(closed).toEqual([
      {
        personId: PERSON,
        runId: RUN,
        outcome: 'refused',
        model: MODEL,
        tokens: { input: 900, output: 150 },
        summary: null,
      },
    ])
    expect(JSON.stringify(closed)).not.toContain('Comiste')
  })

  test('T-ITL-API-UNIT-10 over the ceiling no model is asked, and she is told when it renews', async () => {
    const { service, summarizer, closed } = harness({ state: 'over-ceiling', renewsAt: RENEWS })

    const refusal = await refusalOf(service.requestWeeklySummary(asked))

    expect(refusal).toBeInstanceOf(SummaryCeilingReached)
    expect((refusal as SummaryCeilingReached).renewsAt).toBe(RENEWS)
    expect(summarizer.seen).toEqual([])
    expect(closed).toEqual([])
  })

  test('T-ITL-API-UNIT-11 what the database refuses is refused as it said, before any model', async () => {
    for (const refusal of [
      new ConsentRequired(),
      Object.assign(new Error('x'), { code: 'AF402' }),
    ]) {
      const { service, summarizer, closed } = harness(refusal)
      expect(await refusalOf(service.requestWeeklySummary(asked))).toBe(refusal)
      expect(summarizer.seen).toEqual([])
      expect(closed).toEqual([])
    }
  })

  test('T-ITL-API-UNIT-12 a request sent again answers what its run became, and asks no model twice', async () => {
    const again = harness(replayed('answered'))
    expect(await again.service.requestWeeklySummary(asked)).toEqual({
      outcome: 'summarized',
      summary: kept,
    })
    expect(again.read).toEqual([{ personId: PERSON, weekStartsOn: WEEK }])

    expect(await harness(replayed('nothing-logged')).service.requestWeeklySummary(asked)).toEqual({
      outcome: 'nothing-logged',
      summary: null,
    })

    const over = await refusalOf(
      harness(replayed('over-ceiling')).service.requestWeeklySummary(asked),
    )
    expect(over).toBeInstanceOf(SummaryCeilingReached)
    expect((over as SummaryCeilingReached).renewsAt).toBe(RENEWS)

    for (const outcome of ['unavailable', 'refused'] as const) {
      const failed = await refusalOf(harness(replayed(outcome)).service.requestWeeklySummary(asked))
      expect(failed).toBeInstanceOf(SummaryUnavailable)
      expect((failed as SummaryUnavailable).reason).toBe(outcome)
    }

    for (const outcome of [
      'answered',
      'nothing-logged',
      'over-ceiling',
      'unavailable',
      'refused',
    ] as const) {
      const { service, summarizer, closed } = harness(replayed(outcome))
      await service.requestWeeklySummary(asked).catch(() => undefined)
      expect(summarizer.seen).toEqual([])
      expect(closed).toEqual([])
    }
  })

  test('T-ITL-API-UNIT-13 a request sent again after she deleted its summary says the summary is gone', async () => {
    const { service } = harness(replayed('answered'), { stored: null })
    expect(await refusalOf(service.requestWeeklySummary(asked))).toBeInstanceOf(SummaryDisposed)
  })

  test('T-ITL-API-UNIT-14 with no model configured the capability is closed: nothing is decided and nothing is read', async () => {
    const { service, begun } = harness(opened(trained), { model: false })

    const refusal = await refusalOf(service.requestWeeklySummary(asked))

    expect(refusal).toBeInstanceOf(SummaryUnavailable)
    expect((refusal as SummaryUnavailable).reason).toBe('closed')
    expect(begun).toEqual([])
  })

  test('T-ITL-API-UNIT-15 an answer that arrives after its run was closed is not kept, and she is not shown it', async () => {
    const { service } = harness(opened(trained), { closes: null })

    const refusal = await refusalOf(service.requestWeeklySummary(asked))

    expect(refusal).toBeInstanceOf(SummaryUnavailable)
    expect((refusal as SummaryUnavailable).reason).toBe('run-closed')
  })

  test('T-ITL-API-UNIT-16 a failure that is not the model’s still closes the run, and is not hidden', async () => {
    const { service, summarizer, closed } = harness(opened(trained))
    const broken = new TypeError('a bug')
    summarizer.summarize = () => Promise.reject(broken)

    expect(await refusalOf(service.requestWeeklySummary(asked))).toBe(broken)
    expect(closed.map((closing) => closing.outcome)).toEqual(['unavailable'])
  })
})

describe('her summaries, as she lists and deletes them (HU-SP-127)', () => {
  test('T-ITL-API-UNIT-17 listing and deleting need no model and no consent text', async () => {
    const { service, listed, deleted } = harness(opened(trained), { model: false })

    const page = { personId: PERSON, before: null, limit: 20, requestId: 'r-1' }
    expect(await service.listWeeklySummaries(page)).toEqual({ data: [kept], nextBefore: WEEK })
    expect(listed).toEqual([page])

    await service.deleteWeeklySummary({ personId: PERSON, weekStartsOn: WEEK, ...command })
    expect(deleted).toEqual([{ personId: PERSON, weekStartsOn: WEEK, ...command }])
  })
})

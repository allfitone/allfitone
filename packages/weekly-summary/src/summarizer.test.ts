import { describe, expect, test } from 'bun:test'

import {
  ModelError,
  createMemoryModel,
  type LanguageModel,
  type ModelFailure,
} from '@allfitone/ai-provider'

import { createMemorySummarizer } from './adapters/memory.js'
import { documentOf } from './document.js'
import { createWeeklySummarizerFromEnv } from './factory.js'
import { SummaryError, type WeekDocument } from './port.js'
import { createWeeklySummarizer } from './summarizer.js'

const MODEL = 'us.anthropic.claude-test'

function week(language: 'es' | 'en' = 'es'): WeekDocument {
  const document = documentOf(
    {
      weekStartsOn: '2026-11-09',
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
    },
    language,
  )
  if (!document) throw new Error('the fixture has a week')
  return document
}

const ANSWER = {
  overview: 'Entrenaste una vez esta semana.',
  training: 'El martes hiciste Sentadilla, con 82,5 kg por 5 repeticiones como mejor serie.',
  nutrition: null,
  changes: null,
}

async function failureOf(work: Promise<unknown>): Promise<SummaryError> {
  try {
    await work
  } catch (cause) {
    if (cause instanceof SummaryError) return cause
    throw cause
  }
  throw new Error('it did not fail')
}

describe('the weekly summary over the model port (ADR-045, ADR-053)', () => {
  test('T-WSM-UNIT-43: it sends one text, the instructions and then the week, to the exact model', async () => {
    const model = createMemoryModel()
    model.willAnswer(ANSWER)
    const summarizer = createWeeklySummarizer(model, { model: MODEL, timeoutMs: 9_000 })

    const { summary } = await summarizer.summarize(week())

    expect(summary).toEqual(ANSWER)
    expect(model.seen).toHaveLength(1)
    const [request] = model.seen
    expect(request?.model).toBe(MODEL)
    expect(request?.timeoutMs).toBe(9_000)
    expect(request?.parts).toHaveLength(1)
    const [part] = request?.parts ?? []
    const text = part?.kind === 'text' ? part.text : ''
    expect(text).toContain('Write in Spanish')
    expect(text).toContain('<week>')
    expect(text.indexOf('How to write it')).toBeLessThan(text.lastIndexOf('<week>'))
    expect(text).toContain('"name": "Sentadilla"')
  })

  test('T-WSM-UNIT-44: the week travels as its document, and nothing that identifies her', async () => {
    const model = createMemoryModel()
    model.willAnswer(ANSWER)
    await createWeeklySummarizer(model, { model: MODEL }).summarize(week())

    const [part] = model.seen[0]?.parts ?? []
    const text = part?.kind === 'text' ? part.text : ''
    // The instructions name the tag too: the week is the last one.
    const sent: unknown = JSON.parse(
      text.slice(text.lastIndexOf('<week>') + 6, text.lastIndexOf('</week>')),
    )
    expect(sent).toEqual(week())
    expect(text).not.toContain('019f5000-0000-7000-8000-000000000001')
  })

  test('T-WSM-UNIT-45: the summary is asked in the language of the document', async () => {
    const model = createMemoryModel()
    model.willAnswer({ ...ANSWER, overview: 'You trained once.', training: 'Squats on Tuesday.' })
    await createWeeklySummarizer(model, { model: MODEL }).summarize(week('en'))

    const [part] = model.seen[0]?.parts ?? []
    expect(part?.kind === 'text' ? part.text : '').toContain('Write in English')
  })

  test('T-WSM-UNIT-46: it records the route with the model, and what the answer cost', async () => {
    const counted: LanguageModel = {
      answer: (request) =>
        Promise.resolve({
          value: request.schema.parse(ANSWER),
          usage: { inputTokens: 1840, outputTokens: 96 },
        }),
    }
    const summarizer = createWeeklySummarizer(counted, {
      model: MODEL,
      recordedAs: `bedrock/${MODEL}`,
    })

    expect(summarizer.model).toBe(`bedrock/${MODEL}`)
    expect(await summarizer.summarize(week())).toEqual({
      summary: ANSWER,
      model: `bedrock/${MODEL}`,
      tokens: { input: 1840, output: 96 },
    })
  })

  test('T-WSM-UNIT-47: a model that does not answer is unavailable, whatever the reason', async () => {
    for (const failure of ['unavailable', 'rejected'] satisfies ModelFailure[]) {
      const model = createMemoryModel()
      model.failNext(failure)
      const thrown = await failureOf(
        createWeeklySummarizer(model, { model: MODEL }).summarize(week()),
      )
      expect(thrown.failure).toBe('unavailable')
      expect(thrown.reason).toBeNull()
    }
  })

  test('T-WSM-UNIT-48: an answer of another shape is refused', async () => {
    const model = createMemoryModel()
    model.willAnswer({ overview: 'Solo esto.' })
    const thrown = await failureOf(
      createWeeklySummarizer(model, { model: MODEL }).summarize(week()),
    )
    expect(thrown.failure).toBe('refused')
    expect(thrown.reason).toBe('shape')
    expect(thrown.cause).toBeInstanceOf(ModelError)
  })

  test('T-WSM-UNIT-49: an answer that breaks a rule is refused, and still says what it cost', async () => {
    const counted: LanguageModel = {
      answer: (request) =>
        Promise.resolve({
          value: request.schema.parse({ ...ANSWER, training: 'Hiciste Sentadilla con 90 kg.' }),
          usage: { inputTokens: 1840, outputTokens: 40 },
        }),
    }
    const thrown = await failureOf(
      createWeeklySummarizer(counted, { model: MODEL }).summarize(week()),
    )
    expect(thrown.failure).toBe('refused')
    expect(thrown.reason).toBe('unknown-number')
    expect(thrown.tokens).toEqual({ input: 1840, output: 40 })
    expect(thrown.message).not.toContain('90')
  })

  test('T-WSM-UNIT-50: the memory summariser answers through the same checks, fails when told, and keeps what it saw', async () => {
    const summarizer = createMemorySummarizer('memory/test')
    summarizer.answer(ANSWER, { input: 10, output: 5 })
    expect(await summarizer.summarize(week())).toEqual({
      summary: ANSWER,
      model: 'memory/test',
      tokens: { input: 10, output: 5 },
    })
    expect(summarizer.seen).toEqual([week()])

    summarizer.answer({ ...ANSWER, nutrition: 'Comiste bien.' })
    const refused = await failureOf(summarizer.summarize(week()))
    expect(refused.failure).toBe('refused')
    expect(refused.reason).toBe('part-not-logged')

    summarizer.answer(ANSWER)
    summarizer.failNext('unavailable')
    expect((await failureOf(summarizer.summarize(week()))).failure).toBe('unavailable')
    expect((await summarizer.summarize(week())).summary).toEqual(ANSWER)
  })
})

describe('the summariser the environment describes', () => {
  test('T-WSM-UNIT-51: without a model there is no summariser', () => {
    expect(createWeeklySummarizerFromEnv({})).toBeNull()
    expect(createWeeklySummarizerFromEnv({ WEEKLY_SUMMARY_MODEL: '  ' })).toBeNull()
  })

  test('T-WSM-UNIT-52: it asks Bedrock in the United States, and records the whole slug', () => {
    const summarizer = createWeeklySummarizerFromEnv({
      WEEKLY_SUMMARY_MODEL: 'bedrock/us.anthropic.claude-sonnet-4-6',
    })
    expect(summarizer?.model).toBe('bedrock/us.anthropic.claude-sonnet-4-6')
  })

  test('T-WSM-UNIT-53: another route, another geography or another region is refused at once', () => {
    for (const [model, region] of [
      ['anthropic/claude-sonnet-4-6', undefined],
      ['bedrock/global.anthropic.claude-sonnet-4-6', undefined],
      ['bedrock/anthropic.claude-sonnet-4-6', undefined],
      ['bedrock/us.anthropic.claude-sonnet-4-6', 'eu-west-1'],
    ] as const) {
      expect(() =>
        createWeeklySummarizerFromEnv({
          WEEKLY_SUMMARY_MODEL: model,
          WEEKLY_SUMMARY_REGION: region,
        }),
      ).toThrow('Amazon Bedrock in the United States')
    }
  })
})

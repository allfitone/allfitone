import { describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { createEmailLocale } from './email-locale.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(captured: CapturedQuery[], answer: () => unknown): postgres.Sql {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : answer())
    },
    { begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client) },
  )
  return client as unknown as postgres.Sql
}

const EVENT = '019b9000-0000-7000-8000-000000000a02'

describe('the worker asks the database which language an email speaks', () => {
  test('T-WRK-LOCALE-01 names the worker and the event, and passes on her language', async () => {
    const captured: CapturedQuery[] = []
    expect(
      await createEmailLocale(recordingDatabase(captured, () => [{ locale: 'en' }]))(EVENT),
    ).toBe('en')
    expect(captured[0]?.text).toContain("set_config('app.actor_kind', 'worker', true)")
    expect(captured[1]?.text).toContain('identity.email_locale_for_event(')
    expect(captured[1]?.values).toEqual([EVENT])

    expect(await createEmailLocale(recordingDatabase([], () => [{ locale: 'es' }]))(EVENT)).toBe(
      'es',
    )
  })

  test('T-WRK-LOCALE-02 believes no language the emails are not written in', async () => {
    await expect(
      createEmailLocale(recordingDatabase([], () => [{ locale: 'fr' }]))(EVENT),
    ).rejects.toThrow('PostgreSQL did not say which language the email is written in')
    await expect(createEmailLocale(recordingDatabase([], () => []))(EVENT)).rejects.toThrow(
      'PostgreSQL did not say which language the email is written in',
    )
  })
})

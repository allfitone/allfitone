/**
 * Which language the email of an outbox event is written in (ADR-054 decision 8).
 *
 * The rule is the database's (`identity.email_locale_for_event`): the language the person
 * behind the event chose, and Spanish while she has chosen none or when no person is behind
 * it, such as an invitation to an address nobody holds yet. The worker learns a language,
 * never her preferences.
 *
 * Anything but `es` or `en` is not believed: an email in a language the templates do not
 * have would be an email nobody wrote.
 */

import type { EmailLanguage } from '@allfitone/notifications'
import type postgres from 'postgres'

export type EmailLocale = (eventId: string) => Promise<EmailLanguage>

export function createEmailLocale(sql: postgres.Sql): EmailLocale {
  return async (eventId) => {
    const answer = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      const [row] = await transaction<{ locale: string | null }[]>`
        select identity.email_locale_for_event(${eventId}::uuid) as locale
      `
      return { value: row?.locale }
    })
    if (answer.value !== 'es' && answer.value !== 'en') {
      throw new Error('PostgreSQL did not say which language the email is written in')
    }
    return answer.value
  }
}

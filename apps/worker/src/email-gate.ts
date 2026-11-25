/**
 * Whether the email of an outbox event may go (ADR-054 decision 6).
 *
 * A channel carries a notice; turning it off never removes it. The notice is already in
 * her inbox, written with the event, so a consumer that is told no acknowledges the event
 * and sends nothing. The rule is the database's (`identity.email_allowed_for_event`): a
 * security email always goes, any other follows her email preference for its category
 * with a missing row reading as on, and an event with no person behind it, such as an
 * invitation to an address nobody holds yet, goes as it always did.
 *
 * Every email here is still worded in Spanish: none of these templates has an English
 * version yet, so her language changes nothing about an email today.
 */

import type postgres from 'postgres'

export type EmailGate = (eventId: string) => Promise<boolean>

export function createEmailGate(sql: postgres.Sql): EmailGate {
  return async (eventId) => {
    const allowed = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      const [row] = await transaction<{ allowed: boolean | null }[]>`
        select identity.email_allowed_for_event(${eventId}::uuid) as allowed
      `
      if (typeof row?.allowed !== 'boolean') {
        throw new Error('PostgreSQL did not say whether the email may go')
      }
      return { value: row.allowed }
    })
    return allowed.value
  }
}

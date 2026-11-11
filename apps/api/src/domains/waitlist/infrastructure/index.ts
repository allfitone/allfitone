/**
 * PostgreSQL access for the waitlist.
 *
 * Every call is one closed function and one statement, so there is no transaction to
 * open and no actor to set: a visitor of the waitlist is anonymous, and the tables
 * behind these functions are not readable by the runtime role at all.
 */

import { database } from '../../../platform/db/index.js'
import type {
  WaitlistConfirmationResult,
  WaitlistDatabase,
  WaitlistEmailRequestResult,
  WaitlistJoinResult,
} from '../domain/index.js'

type JoinRow = {
  outcome: 'joined' | 'already_listed' | 'rate_limited'
  referral_code: string | null
  referrals: number | null
}

export function createWaitlistDatabase(): WaitlistDatabase {
  return {
    async join(input, fingerprints, tokens): Promise<WaitlistJoinResult> {
      const [row] = await database()<JoinRow[]>`
        select * from waitlist.join(
          ${input.name}, ${input.email}, ${input.language}, true, ${input.policyVersion},
          ${input.inviterCode ?? null}, ${input.utmSource ?? null}, ${input.utmMedium ?? null},
          ${input.utmCampaign ?? null},
          ${Buffer.from(fingerprints.connection)},
          ${fingerprints.device ? Buffer.from(fingerprints.device) : null},
          ${tokens.confirmation.id}::uuid, ${Buffer.from(tokens.confirmation.hash)},
          ${tokens.privateLink.id}::uuid, ${Buffer.from(tokens.privateLink.hash)},
          ${tokens.keyVersion}::smallint
        )`
      if (!row) throw new Error('PostgreSQL did not answer the waitlist sign-up')
      if (row.outcome !== 'joined') return { outcome: row.outcome }
      if (!row.referral_code) throw new Error('A waitlist sign-up came back without its code')
      return { outcome: 'joined', referralCode: row.referral_code, referrals: row.referrals ?? 0 }
    },

    async confirm(tokenHash, connection): Promise<WaitlistConfirmationResult> {
      const [row] = await database()<Array<{ outcome: WaitlistConfirmationResult }>>`
        select * from waitlist.confirm(${Buffer.from(tokenHash)}, ${Buffer.from(connection)})`
      if (!row) throw new Error('PostgreSQL did not answer the waitlist confirmation')
      return row.outcome
    },

    async requestEmail(email, connection, tokens): Promise<WaitlistEmailRequestResult> {
      const [row] = await database()<Array<{ outcome: WaitlistEmailRequestResult }>>`
        select * from waitlist.request_email(
          ${email}, ${Buffer.from(connection)},
          ${tokens.confirmation.id}::uuid, ${Buffer.from(tokens.confirmation.hash)},
          ${tokens.privateLink.id}::uuid, ${Buffer.from(tokens.privateLink.hash)},
          ${tokens.keyVersion}::smallint
        )`
      if (!row) throw new Error('PostgreSQL did not answer the waitlist email request')
      return row.outcome
    },
  }
}

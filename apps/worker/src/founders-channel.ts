/**
 * The founders' channel: the private Slack channel where Allfit One's founders hear what
 * happens on the platform.
 *
 * The environment names each channel by who reads it, not by what is posted there: one
 * webhook address publishes in one channel, and any notice meant for the founders goes
 * through this one. A notice for other readers gets a channel and a key of its own.
 *
 * **A wrong address must not stop the worker.** Notices ride the same job as every email
 * delivery, so a missing or mistyped address gives no channel instead of an error: the
 * notices wait unclaimed and everything else is delivered as usual.
 */

import { createSlackTeamChannel, type TeamChannel } from '@allfitone/notifications'

export function foundersChannelFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): TeamChannel | undefined {
  const address = environment.SLACK_FOUNDERS_WEBHOOK_URL
  if (!address) return undefined
  try {
    return createSlackTeamChannel(address)
  } catch {
    // The address is a credential: say that it is wrong, never what it is.
    console.error('[worker-outbox] SLACK_FOUNDERS_WEBHOOK_URL is not a Slack incoming webhook')
    return undefined
  }
}

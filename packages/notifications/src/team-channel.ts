/**
 * The team's channel: where Allfit One's own people hear what happens on the platform.
 *
 * The port is one verb, `post`, with plain text. It names no vendor, so the channel can
 * move without its callers changing. The only adapter today posts to a Slack channel
 * through an incoming webhook.
 *
 * **The webhook address is the credential.** Whoever holds it can write in the channel,
 * so it lives with the secrets, never in the repository, and never reaches a log or an
 * error from here.
 *
 * **Slack reads `<`, `>` and `&` as markup.** The adapter escapes them, so a value that
 * came from outside (a campaign name typed into a link) cannot mention the whole channel
 * or draw a link. Callers pass text as they mean it to be read.
 *
 * A channel that no longer exists or a webhook somebody revoked is refused for good:
 * sending again changes nothing. Throttling and Slack's own failures are worth another
 * try.
 */

import { NotificationDeliveryError, type FetchLike } from './index.js'

export interface TeamChannel {
  post(text: string): Promise<void>
}

const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/'
const POST_TIMEOUT_MS = 10_000

export function createSlackTeamChannel(
  webhookUrl: string,
  fetcher: FetchLike = fetch,
): TeamChannel {
  // Anything else is a misconfiguration: this must never post to an arbitrary host.
  if (!webhookUrl.startsWith(SLACK_WEBHOOK_PREFIX)) {
    throw new Error('The Slack webhook address is not a Slack incoming webhook')
  }
  return {
    async post(text) {
      let response: Response
      try {
        response = await fetcher(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: escapeSlackText(text) }),
          signal: AbortSignal.timeout(POST_TIMEOUT_MS),
        })
      } catch {
        throw new NotificationDeliveryError('network_error', true)
      }
      if (response.ok) return
      if (response.status === 429) {
        throw new NotificationDeliveryError('provider_throttled', true)
      }
      if (response.status >= 500) {
        throw new NotificationDeliveryError('provider_unavailable', true)
      }
      throw new NotificationDeliveryError('provider_rejected', false)
    },
  }
}

function escapeSlackText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

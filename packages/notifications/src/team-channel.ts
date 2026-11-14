/**
 * The team's channel: where Allfit One's own people hear what happens on the platform.
 *
 * The port is one verb, `post`, with a notice in our own words: a title, where it comes
 * from, a few labelled facts, and one line that stands alone for a phone's notification.
 * It names no vendor, so the channel can move without its callers changing. The only
 * adapter today posts to a Slack channel through an incoming webhook, and decides there
 * how a notice looks: the title large, the facts in two columns, the brand's cyan beside
 * them.
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

export interface TeamNotice {
  /** Reads whole on its own: a notification shows this and nothing else. */
  summary: string
  title: string
  /** Where the notice comes from, in a few words. */
  origin: string
  facts: ReadonlyArray<{ label: string; value: string }>
}

export interface TeamChannel {
  post(notice: TeamNotice): Promise<void>
}

const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/'
const POST_TIMEOUT_MS = 10_000
/** Allfit One's cyan, `--afo-color-brand-cyan` in the Design System. */
const BRAND_COLOR = '#55EFFB'
// Slack refuses a section with more than ten fields.
const MAX_FACTS = 10

export function createSlackTeamChannel(
  webhookUrl: string,
  fetcher: FetchLike = fetch,
): TeamChannel {
  // Anything else is a misconfiguration: this must never post to an arbitrary host.
  if (!webhookUrl.startsWith(SLACK_WEBHOOK_PREFIX)) {
    throw new Error('The Slack webhook address is not a Slack incoming webhook')
  }
  return {
    async post(notice) {
      let response: Response
      try {
        response = await fetcher(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(slackMessage(notice)),
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

/**
 * The blocks sit inside an attachment because only an attachment carries a colour bar.
 * `fallback` is what a notification shows; a top-level `text` would print twice.
 */
function slackMessage(notice: TeamNotice): unknown {
  return {
    attachments: [
      {
        color: BRAND_COLOR,
        fallback: escapeSlackText(notice.summary),
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: escapeSlackText(notice.title), emoji: false },
          },
          { type: 'context', elements: [{ type: 'mrkdwn', text: escapeSlackText(notice.origin) }] },
          {
            type: 'section',
            fields: notice.facts.slice(0, MAX_FACTS).map((fact) => ({
              type: 'mrkdwn',
              text: `*${escapeSlackText(fact.label)}*\n${escapeSlackText(fact.value)}`,
            })),
          },
        ],
      },
    ],
  }
}

function escapeSlackText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

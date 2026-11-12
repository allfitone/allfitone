/**
 * `POST /api/waitlist/<operation>`: the waitlist's way from the browser to the API,
 * through this app's server. What it adds and why lives in `src/lib/waitlist-relay.ts`.
 */

import { relayWaitlist } from '@/lib/waitlist-relay'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ operation: string }> },
): Promise<Response> {
  const { operation } = await params
  return relayWaitlist(operation, request, {
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    secret: process.env.WAITLIST_SPACE_WEB_SECRET,
    fetch,
  })
}

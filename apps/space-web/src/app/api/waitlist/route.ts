/**
 * Where the waitlist form posts (`POST /api/waitlist`).
 *
 * It sits in this app, not in the browser's path to the API, so the API keeps
 * accepting only its own origins and the request can be checked and limited
 * here before it goes on.
 *
 * NOT IMPLEMENTED YET. The API has no waitlist (TECH-292..294), so this answers
 * 501 and the form shows its failure message: nobody is told they joined a list
 * that keeps nothing. Wiring it (TECH-296) means forwarding the entry to the API
 * and answering with the person's code and referral count, the shape
 * `parseJoined()` in `src/lib/waitlist.ts` reads.
 */

export function POST(): Response {
  return Response.json({ error: 'waitlist-not-available' }, { status: 501 })
}

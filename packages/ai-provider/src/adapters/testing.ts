/** What the adapter tests share. Not exported from the package. */

import { inspect } from 'node:util'

import { ModelError } from '../port.js'

/** How a request ended: the closed failure, or `answered`. */
export const outcome = (pending: Promise<unknown>): Promise<unknown> =>
  pending.then(
    () => 'answered',
    (cause: unknown) => (cause instanceof ModelError ? cause.failure : cause),
  )

/** The error a request failed with, and everything a logger would print of it. */
export async function failureOf(pending: Promise<unknown>): Promise<{
  readonly error: ModelError
  readonly printed: string
}> {
  const error = await pending.then(
    () => null,
    (cause: unknown) => cause,
  )
  if (!(error instanceof ModelError)) throw new Error('the request did not fail closed')
  return { error, printed: `${inspect(error, { depth: 12 })} ${JSON.stringify(error)}` }
}

/**
 * What a `ModelError` may say about a failure (ADR-045).
 *
 * A vendor's error is not safe to pass on. The AI SDK keeps the whole request inside its
 * own, photo and text included, and a parse error quotes the answer it could not read.
 * Any of that in a log is a person's data in a log. So an adapter never hands the
 * vendor's error on as a cause; it says only this much: the error's name, its status and
 * the first line of what the vendor said, or where an answer left the schema.
 */

import type { z } from 'zod'

const LINE = 160
const ISSUES = 3

/** The vendor's error by name, status and first line, cut short. */
export function vendorReason(cause: unknown, status?: number): string {
  if (!(cause instanceof Error)) return 'the vendor failed without an error'
  const line = cause.message.split('\n')[0]?.slice(0, LINE) ?? ''
  return [cause.name, status, line].filter((part) => part !== undefined && part !== '').join(' ')
}

/** Where the answer left the schema: paths and kinds of issue, never a value. */
export function shapeReason(error: z.ZodError): string {
  const issues = error.issues
    .slice(0, ISSUES)
    .map((issue) => `${issue.path.join('.') || 'answer'} ${issue.code}`)
  return `the answer did not match the schema (${issues.join('; ')})`
}

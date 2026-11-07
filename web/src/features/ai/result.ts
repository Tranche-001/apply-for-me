// The `{ ok, data } | { ok, error }` shape every Server Function returns (docs/architecture.md).
import type { z } from 'zod'
import type { AiResult } from './types'

export type ActionResult<T> = AiResult<T>

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { ok: false, error }
}

/** First validation problem, in words a person can act on. */
export function invalidInput(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Something in the form is not valid.'
  const field = issue.path.length ? `${issue.path.join(' › ')}: ` : ''
  return `${field}${issue.message}`
}

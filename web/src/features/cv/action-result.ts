// The shape every Server Function in the CV screens returns (docs/architecture.md: plain-language errors).
import type { z } from 'zod'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** An error whose message is safe and useful to show as is (H9). */
export class UserError extends Error {}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail<T = never>(error: string): ActionResult<T> {
  return { ok: false, error }
}

/** The first validation problem, in words. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Something in the form isn’t valid.'
}

/**
 * Runs a write and turns failures into a plain-language result. Only the error type and message go to
 * the server log, never CV text (docs/architecture.md: privacy).
 */
export async function guarded<T>(label: string, fallback: string, run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await run())
  } catch (err) {
    if (err instanceof UserError) return fail(err.message)
    console.error(`[${label}]`, err instanceof Error ? err.name : 'unknown error')
    return fail(fallback)
  }
}

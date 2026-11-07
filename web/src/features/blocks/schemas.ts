import { z } from 'zod'

export const idSchema = z.string().trim().min(1, 'Something is missing. Reload the page and try again.').max(64)
export const sectionSchema = z.enum(['EXPERIENCE', 'PROJECT'])
const printableKind = z.enum(['PROJECT', 'STACK', 'IMPACT', 'PROJECT_STACK', 'PROJECT_IMPACT', 'STACK_IMPACT'])
const MAX_BULLETS = 12

/** A written bullet, or a gap that says which kind is missing (P1: a gap is never filled for you). */
export const bulletSchema = z.union([
  z.object({ kind: printableKind, text: z.string().trim().min(1).max(1200), want: z.null() }),
  z.object({ kind: z.literal('MISSING'), text: z.string().trim().max(400), want: printableKind }),
])

export const versionContentSchema = z.object({
  title: z.string().trim().min(1, 'Add a title.').max(300),
  bullets: z.array(bulletSchema).max(MAX_BULLETS, `A version holds at most ${MAX_BULLETS} bullets.`),
})

export const versionNameSchema = z.string().trim().max(120, 'Keep the version name under 120 characters.')

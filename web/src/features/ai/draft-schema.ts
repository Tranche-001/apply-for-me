// Validates a DraftVersion coming back from the browser before it is written to the library.
import { z } from 'zod'
import { BULLET_KINDS, SECTIONS } from './context-types'

const text = (max: number) => z.string().trim().max(max, `is too long (${max} characters at most)`)

export const MAX_DRAFT_BULLETS = 12
export const MAX_BULLET_TEXT = 1200
/** A MISSING bullet is never printed; its text is only a hint about what to answer. */
export const MAX_MISSING_HINT = 400

export const draftBulletInput = z
  .object({
    kind: z.enum(BULLET_KINDS),
    text: text(MAX_BULLET_TEXT),
    want: z.enum(BULLET_KINDS).nullable().optional(),
  })
  .refine((b) => b.kind !== 'MISSING' || b.text.length <= MAX_MISSING_HINT, {
    path: ['text'],
    message: `is too long (${MAX_MISSING_HINT} characters at most for a gap)`,
  })

/** The fields of a draft, before the rules that tie them together (so callers can add their own fields). */
export const draftVersionShape = {
  blockId: z.string().trim().min(1).max(64).nullable(),
  newBlock: z
    .object({
      name: text(120).min(1, 'needs a name'),
      section: z.enum(SECTIONS),
      org: text(160),
      location: text(160),
      dates: text(80),
      stack: text(300),
    })
    .nullable(),
  name: text(120),
  title: text(300),
  bullets: z.array(draftBulletInput).max(MAX_DRAFT_BULLETS, 'has too many bullets'),
  waitingOn: z.string().nullable(),
}

type DraftRuleFields = { blockId: string | null; newBlock: unknown; waitingOn: string | null }

export const isVersionOrNewBlock = (d: DraftRuleFields) => Boolean(d.blockId) !== Boolean(d.newBlock)
export const VERSION_OR_NEW_BLOCK_MESSAGE = 'must be either a new version or a new block'
export const isNotWaiting = (d: DraftRuleFields) => d.waitingOn === null
export const NOT_WAITING_MESSAGE = 'is still waiting for your answer, so there is nothing to save'

export const draftVersionInput = z
  .object(draftVersionShape)
  .refine(isVersionOrNewBlock, { message: VERSION_OR_NEW_BLOCK_MESSAGE })
  .refine(isNotWaiting, { message: NOT_WAITING_MESSAGE })

export type DraftVersionInput = z.infer<typeof draftVersionInput>

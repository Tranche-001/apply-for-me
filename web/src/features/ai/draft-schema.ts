// Validates a DraftVersion coming back from the browser before it is written to the library.
import { z } from 'zod'
import { BULLET_KINDS, SECTIONS } from './context-types'

const text = (max: number) => z.string().trim().max(max, `is too long (${max} characters at most)`)

export const draftBulletInput = z.object({
  kind: z.enum(BULLET_KINDS),
  text: text(600),
  want: z.enum(BULLET_KINDS).nullable().optional(),
})

export const draftVersionInput = z
  .object({
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
    bullets: z.array(draftBulletInput).max(6, 'has too many bullets'),
    waitingOn: z.string().nullable(),
  })
  .refine((d) => Boolean(d.blockId) !== Boolean(d.newBlock), { message: 'must be either a new version or a new block' })
  .refine((d) => d.waitingOn === null, { message: 'is still waiting for your answer, so there is nothing to save' })

export type DraftVersionInput = z.infer<typeof draftVersionInput>

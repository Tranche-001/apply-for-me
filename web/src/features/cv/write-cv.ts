// Writing the CV of a job inside a transaction. Not a 'use server' module (those may only export actions),
// so saveCv and any other action that saves a job's CV can share it.
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { idSchema, sectionSchema } from '../blocks/schemas'
import { UserError } from './action-result'

const MAX_ITEMS = 200

export const saveCvSchema = z.object({
  jobId: idSchema,
  pages: z.union([z.literal(1), z.literal(2)]),
  sectionOrder: z.array(sectionSchema).min(1).max(2),
  /** One "Experience & Projects" section; missing = two sections. */
  oneSection: z.boolean().optional(),
  showEducation: z.boolean(),
  showSkills: z.boolean(),
  showAchievements: z.boolean(),
  items: z
    .array(z.object({ section: sectionSchema, position: z.number().int().min(0).max(MAX_ITEMS), versionId: idSchema }))
    .max(MAX_ITEMS),
})

/** A validated CV (the output of saveCvSchema). */
export type SaveCvInput = z.output<typeof saveCvSchema>

/** The CV for this job is replaced by `input`. Throws UserError (plain language) when the job or a version is gone. */
export async function writeCv(tx: Prisma.TransactionClient, input: SaveCvInput): Promise<{ savedLabel: string }> {
  const job = await tx.job.findUnique({ where: { id: input.jobId }, select: { id: true } })
  if (!job) throw new UserError('That job no longer exists. Pick another one.')
  const versionIds = [...new Set(input.items.map((i) => i.versionId))]
  const found = await tx.version.count({ where: { id: { in: versionIds } } })
  if (found !== versionIds.length) throw new UserError('A version in this CV was removed from your library. Pick another version and save again.')
  const fields = {
    pages: input.pages,
    sectionOrder: [...new Set(input.sectionOrder)],
    oneSection: input.oneSection ?? false,
    showEducation: input.showEducation,
    showSkills: input.showSkills,
    showAchievements: input.showAchievements,
    source: '',
    savedAt: new Date(),
  }
  const cv = await tx.cv.upsert({ where: { jobId: job.id }, create: { jobId: job.id, ...fields }, update: fields })
  await tx.cvItem.deleteMany({ where: { cvId: cv.id } })
  if (input.items.length) {
    await tx.cvItem.createMany({ data: input.items.map((i) => ({ cvId: cv.id, versionId: i.versionId, section: i.section, position: i.position })) })
  }
  return { savedLabel: `Saved ${cv.savedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` }
}

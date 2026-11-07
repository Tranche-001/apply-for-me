'use server'

// Saving the CV for a job, and the answers you give to the AI's questions.
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { idSchema } from '@/features/blocks/schemas'
import { appendAnswerToExperience } from '@/features/experiences/answers'
import { answerEntry } from '@/features/experiences/types'
import { jobLabel } from '@/features/jobs/links'
import { UserError, fail, firstIssue, guarded, type ActionResult } from './action-result'
import { saveCvSchema, writeCv } from './write-cv'

/** Save CV: the CV for this job is replaced by what you see (blocks, versions, order, length, sections). */
export async function saveCv(input: z.input<typeof saveCvSchema>): Promise<ActionResult<{ savedLabel: string }>> {
  const parsed = saveCvSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const d = parsed.data
  const result = await guarded('saveCv', 'Couldn’t save the CV. Your changes are still here; try again.', () =>
    db.$transaction((tx) => writeCv(tx, d)),
  )
  if (result.ok) refresh()
  return result
}

const answerSchema = z.object({
  jobId: idSchema,
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().min(1, 'Write your answer first.').max(4000),
})

/**
 * "Add to CV" on a question the AI asked: your answer, in your words, is saved to Experiences for the AI
 * to draft a bullet from (decision log). Nothing is written to the CV by itself (P1, P2).
 */
export async function saveAskAnswer(input: z.input<typeof answerSchema>): Promise<ActionResult<null>> {
  const parsed = answerSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const d = parsed.data
  const result = await guarded('saveAskAnswer', 'Couldn’t save your answer. It is still here; try again.', () =>
    db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: d.jobId }, select: { company: true, role: true } })
      if (!job) throw new UserError('That job no longer exists.')
      const entry = answerEntry({ jobLabel: jobLabel(job.company, job.role), question: d.question, answer: d.answer })
      await appendAnswerToExperience(tx, null, entry)
      return null
    }),
  )
  if (result.ok) refresh()
  return result
}

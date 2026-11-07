'use server'

// Experiences writes. Every input is validated; every success refreshes the route.
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { draftVersionInput } from '../ai/draft-schema'
import { saveDraftToLibrary } from '../ai/library-writes'
import { jobLabel } from '../ai/labels'
import { fail, invalidInput, ok, type ActionResult } from '../ai/result'
import { appendAnswerToExperience, type PlacedAnswer } from './answers'
import { answerEntry, type ExperienceFields, type ExperienceItem } from './types'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')

const fieldsInput = z.object({
  id,
  title: z.string().max(200, 'Title is too long (200 characters at most).'),
  where: z.string().max(300, 'Where is too long (300 characters at most).'),
  when: z.string().max(120, 'When is too long (120 characters at most).'),
  notes: z.string().max(50_000, 'The notes are too long (50,000 characters at most).'),
})

async function attempt<T>(what: string, work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work()
    refresh()
    return ok(data)
  } catch (err) {
    console.error(`[experiences] ${what} failed`, dbLogContext(err))
    return fail(plainDbError(err))
  }
}

/** New experience at the top of the list, empty. */
export async function createExperience(): Promise<ActionResult<ExperienceItem>> {
  return attempt('create', async () => {
    const first = await db.experience.findFirst({ orderBy: { position: 'asc' }, select: { position: true } })
    const e = await db.experience.create({ data: { title: '', position: (first?.position ?? 1) - 1 } })
    return { id: e.id, title: e.title, where: e.where, when: e.when, notes: e.notes, blocks: [] }
  })
}

/** Autosave: the whole set of fields of one experience. */
export async function updateExperience(input: ExperienceFields): Promise<ActionResult<null>> {
  const parsed = fieldsInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { id: experienceId, ...data } = parsed.data
  return attempt('update', async () => {
    await db.experience.update({ where: { id: experienceId }, data })
    return null
  })
}

/** Deletes the notes; blocks made from them stay in the library (their link is cleared). */
export async function deleteExperience(input: { id: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ id }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  return attempt('delete', async () => {
    await db.experience.delete({ where: { id: parsed.data.id } })
    return null
  })
}

const keepInput = z.object({ experienceId: id, draft: draftVersionInput })

/** "Keep" on a drafted block: saves it to the library and links new blocks to this experience. */
export async function keepBlockDraft(input: {
  experienceId: string
  draft: unknown
}): Promise<ActionResult<{ block: { id: string; name: string }; versionName: string; isNewBlock: boolean }>> {
  const parsed = keepInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { experienceId, draft } = parsed.data
  return attempt('keepBlockDraft', async () => {
    const saved = await db.$transaction(async (tx) => {
      const exists = await tx.experience.findUnique({ where: { id: experienceId }, select: { id: true } })
      if (!exists) throw Object.assign(new Error('gone'), { code: 'P2025' })
      return saveDraftToLibrary(tx, draft, { experienceId })
    })
    return { block: { id: saved.blockId, name: saved.blockName }, versionName: saved.versionName, isNewBlock: saved.isNewBlock }
  })
}

const answersInput = z.object({
  jobId: id,
  items: z
    .array(
      z.object({
        question: z.string().trim().min(1, 'is missing').max(2000, 'is too long'),
        answer: z.string().trim().min(1, 'Write your answer first.').max(4000, 'Your answer is too long (4000 characters at most).'),
        experienceId: id.nullable(),
      }),
    )
    .min(1)
    .max(12),
})

/**
 * Job analysis → your answers to the gap questions go to Experiences: each one is added to the end of
 * the experience it is about (or "Answers to the AI's questions"), never changing what is there.
 * Returns where each answer went, in the same order.
 */
export async function addAnswersToExperiences(input: z.input<typeof answersInput>): Promise<ActionResult<PlacedAnswer[]>> {
  const parsed = answersInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, items } = parsed.data
  return attempt('addAnswersToExperiences', () =>
    db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId }, select: { company: true, role: true } })
      if (!job) throw Object.assign(new Error('gone'), { code: 'P2025' })
      const placed: PlacedAnswer[] = []
      for (const item of items) {
        const entry = answerEntry({ jobLabel: jobLabel(job), question: item.question, answer: item.answer })
        placed.push(await appendAnswerToExperience(tx, item.experienceId, entry))
      }
      return placed
    }),
  )
}

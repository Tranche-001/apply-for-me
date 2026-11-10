'use server'

// Behavioral writes: the generalist answer, your theory notes and references, "Use in my answers",
// and the answer adapted to a job. Every input is validated; every success refreshes the route.
import { randomUUID } from 'node:crypto'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { fail, invalidInput, ok, type ActionResult } from '../ai/result'
import { CUSTOM_KEY_PREFIX, dbLang, type Lang } from './types'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')
const answerText = z.string().max(20_000, 'The answer is too long (20,000 characters at most).')

async function attempt(what: string, work: () => Promise<unknown>): Promise<ActionResult<null>> {
  try {
    await work()
    refresh()
    return ok(null)
  } catch (err) {
    console.error(`[behavioral] ${what} failed`, dbLogContext(err))
    return fail(plainDbError(err))
  }
}

const lang = z.enum(['en', 'pt'])

/** The generalist answer in one language; the other language's answer is never touched. */
export async function saveAnswer(input: { questionId: string; lang: Lang; answer: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ questionId: id, lang, answer: answerText }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, answer } = parsed.data
  const data = parsed.data.lang === 'pt' ? { answerPt: answer } : { answer }
  return attempt('saveAnswer', () => db.behavioralQuestion.update({ where: { id: questionId }, data }))
}

const theoryInput = z.object({
  questionId: id,
  theory: z.string().max(20_000, 'The notes are too long (20,000 characters at most).'),
  references: z.array(z.string().trim().min(1).max(500, 'A reference is too long (500 characters at most).')).max(50, 'Too many references (50 at most).'),
})

export async function saveTheory(input: { questionId: string; theory: string; references: string[] }): Promise<ActionResult<null>> {
  const parsed = theoryInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, theory, references } = parsed.data
  return attempt('saveTheory', () => db.behavioralQuestion.update({ where: { id: questionId }, data: { theory, references } }))
}

export async function setUseFounder(input: { questionId: string; useFounder: boolean }): Promise<ActionResult<null>> {
  const parsed = z.object({ questionId: id, useFounder: z.boolean() }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, useFounder } = parsed.data
  return attempt('setUseFounder', () => db.behavioralQuestion.update({ where: { id: questionId }, data: { useFounder } }))
}

const newQuestion = z.object({
  short: z.string().trim().min(1, 'Give the question a short name for the list.').max(80, 'The short name is too long (80 characters at most).'),
  full: z.string().trim().min(1, 'Write the question as the interviewer asks it.').max(1_000, 'The question is too long (1,000 characters at most).'),
})

/** A question you add: a short name for the list and the question as asked. It goes to the end of the list; its key
 * marks it as yours, so it can be deleted. */
export async function addQuestion(input: { short: string; full: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = newQuestion.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { short, full } = parsed.data
  try {
    const last = await db.behavioralQuestion.aggregate({ _max: { position: true } })
    const created = await db.behavioralQuestion.create({
      data: {
        short,
        full,
        looksFor: [],
        key: `${CUSTOM_KEY_PREFIX}${randomUUID()}`,
        position: (last._max.position ?? -1) + 1,
        references: [],
        founderRefs: [],
      },
      select: { id: true },
    })
    refresh()
    return ok(created)
  } catch (err) {
    console.error('[behavioral] addQuestion failed', dbLogContext(err))
    return fail(plainDbError(err))
  }
}

/** The list in the order you dragged it: each question's position becomes its place in `ids`. */
export async function reorderQuestions(input: { ids: string[] }): Promise<ActionResult<null>> {
  const parsed = z.object({ ids: z.array(id).min(1).max(500, 'Too many questions (500 at most).') }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { ids } = parsed.data
  if (new Set(ids).size !== ids.length) return fail('The new order lists a question twice. Reload the page and try again.')
  return attempt('reorderQuestions', () =>
    db.$transaction(ids.map((questionId, position) => db.behavioralQuestion.update({ where: { id: questionId }, data: { position } }))),
  )
}

/** Deletes a question you added, with its answers. The app's own questions cannot be deleted. */
export async function deleteQuestion(input: { questionId: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ questionId: id }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId } = parsed.data
  try {
    const { count } = await db.behavioralQuestion.deleteMany({ where: { id: questionId, key: { startsWith: CUSTOM_KEY_PREFIX } } })
    if (count === 0) return fail('Only questions you added can be deleted. Reload the page if this one is already gone.')
    refresh()
    return ok(null)
  } catch (err) {
    console.error('[behavioral] deleteQuestion failed', dbLogContext(err))
    return fail(plainDbError(err))
  }
}

/** The answer adapted to one job. Clearing the text removes it, so the generalist one is used again. */
export async function saveTailored(input: { questionId: string; jobId: string; lang: Lang; text: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ questionId: id, jobId: id, lang, text: answerText }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, jobId, text } = parsed.data
  const l = dbLang(parsed.data.lang)
  return attempt('saveTailored', () =>
    text.trim()
      ? db.tailoredAnswer.upsert({
          where: { questionId_jobId_lang: { questionId, jobId, lang: l } },
          create: { questionId, jobId, lang: l, text },
          update: { text },
        })
      : db.tailoredAnswer.deleteMany({ where: { questionId, jobId, lang: l } }),
  )
}

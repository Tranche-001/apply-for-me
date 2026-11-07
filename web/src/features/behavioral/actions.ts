'use server'

// Behavioral writes: the generalist answer, your theory notes and references, "Use in my answers",
// and the answer adapted to a job. Every input is validated; every success refreshes the route.
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { fail, invalidInput, ok, type ActionResult } from '../ai/result'

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

export async function saveAnswer(input: { questionId: string; answer: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ questionId: id, answer: answerText }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, answer } = parsed.data
  return attempt('saveAnswer', () => db.behavioralQuestion.update({ where: { id: questionId }, data: { answer } }))
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

/** The answer adapted to one job. Clearing the text removes it, so the generalist one is used again. */
export async function saveTailored(input: { questionId: string; jobId: string; text: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ questionId: id, jobId: id, text: answerText }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, jobId, text } = parsed.data
  return attempt('saveTailored', () =>
    text.trim()
      ? db.tailoredAnswer.upsert({
          where: { questionId_jobId: { questionId, jobId } },
          create: { questionId, jobId, text },
          update: { text },
        })
      : db.tailoredAnswer.deleteMany({ where: { questionId, jobId } }),
  )
}

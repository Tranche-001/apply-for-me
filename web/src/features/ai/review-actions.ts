'use server'

// REVIEW after the CV appears (Job analysis, review step):
//  - reviewCv: the AI makes a new CV for the same job from his request; it comes back checked as the After CV and
//    is kept in the session (nothing is written here).
//  - learnRulesFromReview: "Remember this for next CVs", on Keep After: his request as 1 to 3 'cv' rules, switched on,
//    "Learned from your review of <job>"; a rule whose text he already has is not added again.
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { reviewAfter } from '../analysis/cv-review'
import { reviewSnapshot } from '../analysis/review-state'
import { analysisSessionSchema, SESSION_LIMITS } from '../analysis/session'
import type { AnalysisSession, CvReview } from '../analysis/types'
import { getLibrary } from '../blocks/queries'
import { newRuleTexts, reviewRuleSource, type RuleItem } from '../preferences/types'
import { getAi, type AiRunner } from './client'
import { loadExperiences, loadJob, loadLibrary, loadProfile, loadRules } from './context'
import { dbLogContext, plainDbError } from './db-errors'
import { errorLogContext, plainAiError } from './errors'
import { TASKS } from './model'
import { NOT_READY } from './provider'
import { fail, invalidInput, ok } from './result'
import { buildCvReviewPrompt, buildReviewRulesPrompt, rulesFromRequest } from './review-prompt'
import { cvReviewOutputSchema, reviewRulesOutputSchema } from './schemas'
import type { AiResult } from './types'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')
const request = z.string().trim().min(1, 'Say how this CV should be better.').max(SESSION_LIMITS.reviewRequest, `is too long (${SESSION_LIMITS.reviewRequest} characters at most)`)
const MISSING_JOB = 'This job no longer exists. Reload the page.'

async function guarded<T>(what: string, ai: AiRunner, work: () => Promise<AiResult<T>>): Promise<AiResult<T>> {
  try {
    return await work()
  } catch (err) {
    console.error(`[ai] ${what} failed`, errorLogContext(err))
    return fail(plainAiError(err, ai.provider, ai.source))
  }
}

const reviewInput = z.object({ jobId: id, request, remember: z.boolean(), session: z.unknown() })

/** "Make a new CV": the CV now (from the session sent, validated like the autosave) and his request go to the AI. */
export async function reviewCv(input: { jobId: string; request: string; remember: boolean; session: unknown }): Promise<AiResult<CvReview>> {
  const parsed = reviewInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const s = analysisSessionSchema.safeParse(parsed.data.session)
  if (!s.success) return fail('The CV on this page couldn’t be read. Reload the page and try again.')
  const session = s.data as AnalysisSession
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  const { jobId, remember } = parsed.data
  const text = parsed.data.request
  return guarded('reviewCv', ai, async () => {
    const job = await loadJob(jobId)
    if (!job) return fail(MISSING_JOB)
    const [library, experiences, rules, profile, libBlocks] = await Promise.all([loadLibrary(), loadExperiences(), loadRules('cv'), loadProfile(), getLibrary()])
    const cv = reviewSnapshot(session, libBlocks, job.role)
    if (!cv.rows.length) return fail('This CV has no blocks yet: put one on it first.')
    const raw = await ai.run(buildCvReviewPrompt({ job, library, experiences, rules, profile, cv, request: text }), cvReviewOutputSchema, TASKS.cvReview)
    const review: CvReview = { request: text, remember, ...reviewAfter(session, raw, { library: libBlocks, jobRole: job.role, request: text }), madeAt: new Date().toISOString() }
    // What the screen keeps must also pass the session schema (it is autosaved with the job).
    if (!analysisSessionSchema.safeParse({ ...session, review }).success) return fail('The AI’s new CV couldn’t be read. Nothing was changed; try again.')
    return ok(review)
  })
}

export type LearnedRules = { added: RuleItem[]; already: number }

const learnInput = z.object({ jobId: id, request })

/** His request as rules: as he wrote it when it is one short sentence, else 1 to 3 rules the AI writes from it. */
export async function learnRulesFromReview(input: { jobId: string; request: string }): Promise<AiResult<LearnedRules>> {
  const parsed = learnInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, request: text } = parsed.data
  const job = await loadJob(jobId).catch(() => null)
  if (!job) return fail(MISSING_JOB)
  const existing = await db.preferenceRule.findMany({ select: { text: true } }).catch(() => null)
  if (!existing) return fail('Couldn’t read your rules. Try again.')
  let candidates = rulesFromRequest(text)
  if (!candidates) {
    const ai = await getAi()
    if (!ai) return fail(NOT_READY)
    const written = await guarded('learnRulesFromReview', ai, async () => {
      const raw = await ai.run(buildReviewRulesPrompt({ request: text, jobLabel: job.label, existing: existing.map((r) => r.text) }), reviewRulesOutputSchema, TASKS.reviewRules)
      return ok(raw.rules)
    })
    if (!written.ok) return written
    candidates = written.data
  }
  const texts = newRuleTexts(candidates, existing.map((r) => r.text))
  if (!texts.length) return ok({ added: [], already: candidates.length })
  const source = reviewRuleSource(job.label)
  let added: Awaited<ReturnType<typeof db.preferenceRule.create>>[]
  try {
    added = await db.$transaction(async (tx) => {
      const last = await tx.preferenceRule.findFirst({ where: { group: 'cv' }, orderBy: { position: 'desc' }, select: { position: true } })
      const first = (last?.position ?? -1) + 1
      const rows = []
      for (const [i, t] of texts.entries()) rows.push(await tx.preferenceRule.create({ data: { group: 'cv', text: t, source, on: true, position: first + i } }))
      return rows
    })
  } catch (err) {
    console.error('[ai] learnRulesFromReview: saving the rules failed', dbLogContext(err))
    return fail(plainDbError(err))
  }
  // Outside the try: rules that are saved are never reported as failed because the refresh threw.
  try {
    refresh()
  } catch (err) {
    console.error('[ai] learnRulesFromReview: refresh failed', dbLogContext(err))
  }
  return ok({ added: added.map((r) => ({ id: r.id, group: r.group, text: r.text, source: r.source, on: r.on, position: r.position })), already: Math.max(0, candidates.length - texts.length) })
}

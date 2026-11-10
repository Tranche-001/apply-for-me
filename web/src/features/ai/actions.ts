'use server'

// AI entry points. The four original signatures are fixed so screens can call them; the extra exports
// (analyzeJob, reviseAnswer) serve Job analysis and Behavioral.
// Rules (docs/design-principles.md): the AI never invents a fact (P1), every output is a draft you
// can edit (P2), and it reuses an existing version before writing a new one (P3).
// None of these write to the database: the screens save what you keep.
import { z } from 'zod'
import { getAi, type AiRunner } from './client'
import { loadExperiences, loadJob, loadLibrary, loadProfile, loadQuestion, loadRules } from './context'
import { errorLogContext, plainAiError } from './errors'
import { TASKS } from './model'
import { finalizePlacement } from './placement'
import { finalizePostingJobs, type PostingJob } from './posting-jobs'
import { draftBlockWith } from './block-draft'
import { finalizeAnalysis, finalizeCvPlan, toPostingSummary } from './postprocess'
import { NOT_READY } from './provider'
import { buildAnalysisPrompt, buildAnswerPrompt, buildCvPlanPrompt, buildPlacementPrompt, buildPostingJobsPrompt } from './prompts'
import { fail, invalidInput, ok } from './result'
import { analysisOutputSchema, answerOutputSchema, cvPlanOutputSchema, placementOutputSchema, postingJobsOutputSchema } from './schemas'
import type { AiAsk, AiReportLine, AiResult, AnalyzeJobInput, AnswerDraft, AnswerPlacement, CvPlan, DraftVersion, JobAnalysis } from './types'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')

const MISSING_JOB = 'This job no longer exists. Pick another one.'
const NO_POSTING = 'Read the job posting first: add its link and press Analyze, or paste the job text.'

/** Runs one action and turns any failure into a plain-language error; logs only the error's class. */
async function guarded<T>(what: string, ai: AiRunner, work: () => Promise<AiResult<T>>): Promise<AiResult<T>> {
  try {
    return await work()
  } catch (err) {
    console.error(`[ai] ${what} failed`, errorLogContext(err))
    return fail(plainAiError(err, ai.provider, ai.source))
  }
}

const cvPlanInput = z.object({ jobId: id, pages: z.union([z.literal(1), z.literal(2)]) })

/** Compose CV → Generate / Regenerate: a CV for the job from your blocks and versions. */
export async function generateCvPlan(input: { jobId: string; pages: 1 | 2 }): Promise<AiResult<CvPlan>> {
  const parsed = cvPlanInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  const { jobId, pages } = parsed.data
  return guarded('generateCvPlan', ai, async () => {
    const job = await loadJob(jobId)
    if (!job) return fail(MISSING_JOB)
    const [library, profile, rules] = await Promise.all([loadLibrary(), loadProfile(), loadRules('cv')])
    if (!library.length) return fail('Your library has no blocks yet. Add one in Blocks first.')
    const prompt = buildCvPlanPrompt({ job, pages, library, profile, rules })
    const raw = await ai.run(prompt, cvPlanOutputSchema, TASKS.cvPlan)
    return ok(finalizeCvPlan(raw, library, pages))
  })
}

const answersSchema = z
  .array(z.object({ id: z.string().trim().min(1).max(40), question: z.string().max(2000), answer: z.string().max(4000).nullable() }))
  .max(12)
const analyzeJobInput = z.object({
  jobId: id,
  answers: answersSchema.optional(),
  instruction: z.string().trim().max(1000, 'is too long (1000 characters at most)').nullable().optional(),
  previousDrafts: z
    .array(z.object({ blockName: z.string().max(200), title: z.string().max(400), bullets: z.array(z.string().max(1000)).max(6) }))
    .max(20)
    .optional(),
})

/** Job analysis → Analyze / Update drafts with my answers / Ask for changes. */
export async function analyzeJob(input: AnalyzeJobInput): Promise<AiResult<JobAnalysis>> {
  const parsed = analyzeJobInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  const { jobId, answers = [], instruction = null, previousDrafts = [] } = parsed.data
  return guarded('analyzeJob', ai, async () => {
    const job = await loadJob(jobId)
    if (!job) return fail(MISSING_JOB)
    if (!job.postingText.trim()) return fail(NO_POSTING)
    const [library, experiences, rules, profile] = await Promise.all([loadLibrary(), loadExperiences(), loadRules('cv'), loadProfile()])
    const prompt = buildAnalysisPrompt({ job, library, experiences, rules, answers, instruction, previousDrafts, profile })
    const raw = await ai.run(prompt, analysisOutputSchema, TASKS.analysis)
    return ok(finalizeAnalysis(raw, library, job.label, experiences, job.postingText, profile, job.role))
  })
}

/** Job analysis → Analyze: read the posting, compare it with your blocks, ask about gaps, draft versions. */
export async function analyzePosting(input: { jobId: string }): Promise<
  AiResult<{ requirements: { text: string; covered: boolean }[]; asks: AiAsk[]; drafts: DraftVersion[]; report: AiReportLine[] }>
> {
  const result = await analyzeJob({ jobId: input?.jobId })
  return result.ok ? ok(toPostingSummary(result.data)) : result
}

const answerInput = z.object({ questionId: id, jobId: id.nullable() })

async function draftAnswerWith(
  questionId: string,
  jobId: string | null,
  revise: { current: string; instruction: string } | null,
): Promise<AiResult<AnswerDraft>> {
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  return guarded('draftAnswer', ai, async () => {
    const question = await loadQuestion(questionId)
    if (!question) return fail('This question no longer exists. Reload the page.')
    const job = jobId ? await loadJob(jobId) : null
    if (jobId && !job) return fail(MISSING_JOB)
    const [library, experiences, rules] = await Promise.all([loadLibrary(), loadExperiences(), loadRules('qa')])
    const prompt = buildAnswerPrompt({ question, job, library, experiences, rules, generalist: question.answer, revise })
    const raw = await ai.run(prompt, answerOutputSchema, TASKS.answer)
    const text = raw.text.trim()
    if (!text) return fail('The AI returned an empty answer. Nothing was changed; try again.')
    return ok({ text, changes: raw.changes.map((c) => c.trim()).filter(Boolean).slice(0, 4) })
  })
}

/** Behavioral → Draft from my blocks / Generate answer for a job. */
export async function draftAnswer(input: { questionId: string; jobId: string | null }): Promise<AiResult<{ text: string; changes: string[] }>> {
  const parsed = answerInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  return draftAnswerWith(parsed.data.questionId, parsed.data.jobId, null)
}

const reviseInput = answerInput.extend({
  current: z.string().trim().min(1, 'There is no answer to change yet.').max(8000, 'is too long'),
  instruction: z.string().trim().min(1, 'Say what to change.').max(1000, 'is too long (1000 characters at most)'),
})

/** Behavioral → Ask for changes on an answer. */
export async function reviseAnswer(input: {
  questionId: string
  jobId: string | null
  current: string
  instruction: string
}): Promise<AiResult<AnswerDraft>> {
  const parsed = reviseInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { questionId, jobId, current, instruction } = parsed.data
  return draftAnswerWith(questionId, jobId, { current, instruction })
}

const blockInput = z.object({ experienceId: id })

/** Experiences → Draft a block from this. */
export async function draftBlockFromExperience(input: { experienceId: string }): Promise<AiResult<DraftVersion>> {
  const parsed = blockInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  return guarded('draftBlockFromExperience', ai, async () => {
    const [experiences, library, rules] = await Promise.all([loadExperiences(), loadLibrary(), loadRules('cv')])
    const experience = experiences.find((e) => e.id === parsed.data.experienceId)
    if (!experience) return fail('This experience no longer exists. Reload the page.')
    if (!experience.notes.trim()) return fail('Write something about this experience first. The AI only uses what is written here.')
    return ok(await draftBlockWith(ai, experience, library, rules))
  })
}

const postingJobsInput = z.object({
  postingText: z.string().trim().min(20, 'There is no job text to read.').max(40_000, 'The job text is too long (40,000 characters at most).'),
})

/**
 * Job analysis v2 → "Analyze": the jobs a posting holds. One entry when it holds one job (the whole text, either name
 * may be empty); several when the AI found more than one and the lines that begin and end each really are in the text.
 * Writes nothing.
 */
export async function readPostingJobs(input: { postingText: string }): Promise<AiResult<PostingJob[]>> {
  const parsed = postingJobsInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  const { postingText } = parsed.data
  return guarded('readPostingJobs', ai, async () => {
    const raw = await ai.run(buildPostingJobsPrompt(postingText), postingJobsOutputSchema, TASKS.postingJobs)
    return ok(finalizePostingJobs(raw, postingText))
  })
}

const placeInput = z.object({
  jobId: id,
  items: z
    .array(
      z.object({
        askId: z.string().trim().min(1, 'is missing').max(40, 'is not a valid id'),
        question: z.string().trim().min(1, 'is missing').max(2000, 'is too long'),
        answer: z.string().trim().min(1, 'Write your answer first.').max(4000, 'Your answer is too long (4000 characters at most).'),
      }),
    )
    .min(1, 'There is no answer to place.')
    .max(12, 'Place at most 12 answers at a time.'),
})

/** Job analysis v2 → "Send answers": the AI says which experience each written answer belongs to. Writes nothing. */
export async function placeAnswers(input: { jobId: string; items: { askId: string; question: string; answer: string }[] }): Promise<AiResult<AnswerPlacement[]>> {
  const parsed = placeInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const ai = await getAi()
  if (!ai) return fail(NOT_READY)
  const { jobId, items } = parsed.data
  return guarded('placeAnswers', ai, async () => {
    const job = await loadJob(jobId)
    if (!job) return fail(MISSING_JOB)
    const experiences = await loadExperiences()
    const raw = await ai.run(buildPlacementPrompt({ items, experiences }), placementOutputSchema, TASKS.placement)
    return ok(finalizePlacement(raw, items, experiences))
  })
}

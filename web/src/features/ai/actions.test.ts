// The AI Server Functions with the database and the Claude client mocked: never calls the real API.
// (The Gemini path shares everything after getAi(); gemini-run.test.ts covers its runner.)
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { EXPERIENCE, JOB, LIBRARY, PROFILE, QUESTION } from './test-fixtures'
import { aiMessages } from './errors'
import { NOT_READY } from './provider'
import type { Prompt } from './prompts'
import type { TaskConfig } from './run'
import type Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'

const MESSAGES = aiMessages('claude')

const stream = vi.fn()
const getClient = vi.fn()
const loadJob = vi.fn(async (id: string) => (id === JOB.id ? JOB : null))

// getAi() hands the actions a Claude runner over the fake client, or null when no key is set.
vi.mock('./client', async () => {
  const { runStructured } = await import('./run')
  return {
    getAi: () => {
      const client = getClient() as Anthropic | null
      if (!client) return null
      return { provider: 'claude', run: <T,>(p: Prompt, s: z.ZodType<T>, t: TaskConfig) => runStructured(client, p, s, t) }
    },
  }
})
vi.mock('./context', () => ({
  loadLibrary: async () => LIBRARY,
  loadProfile: async () => PROFILE,
  loadRules: async () => ['Start every bullet with a verb.'],
  loadJob: (id: string) => loadJob(id),
  loadExperiences: async () => [EXPERIENCE, { ...EXPERIENCE, id: 'e-empty', notes: ' ', blockIds: [] }],
  loadQuestion: async (id: string) => (id === QUESTION.id ? QUESTION : null),
}))

const { analyzeJob, analyzePosting, draftAnswer, draftBlockFromExperience, generateCvPlan, reviseAnswer } = await import('./actions')

function replyWith(json: unknown, stop_reason = 'end_turn') {
  stream.mockReturnValueOnce({ finalMessage: async () => ({ stop_reason, content: [{ type: 'text', text: JSON.stringify(json) }] }) })
}

beforeEach(() => {
  stream.mockReset()
  getClient.mockReset()
  getClient.mockReturnValue({ beta: { messages: { stream } } })
})

describe('without an API key', () => {
  test('every AI action returns the "not set up" error and never calls the API', async () => {
    getClient.mockReturnValue(null)
    expect(await generateCvPlan({ jobId: JOB.id, pages: 1 })).toEqual({ ok: false, error: NOT_READY })
    expect(await analyzePosting({ jobId: JOB.id })).toEqual({ ok: false, error: NOT_READY })
    expect(await draftAnswer({ questionId: QUESTION.id, jobId: null })).toEqual({ ok: false, error: NOT_READY })
    expect(await draftBlockFromExperience({ experienceId: EXPERIENCE.id })).toEqual({ ok: false, error: NOT_READY })
    expect(stream).not.toHaveBeenCalled()
  })
})

describe('input validation', () => {
  test('bad input is refused before anything else', async () => {
    expect((await generateCvPlan({ jobId: '', pages: 1 })).ok).toBe(false)
    expect((await generateCvPlan({ jobId: JOB.id, pages: 3 as 1 })).ok).toBe(false)
    expect((await reviseAnswer({ questionId: QUESTION.id, jobId: null, current: 'x', instruction: ' ' })).ok).toBe(false)
    expect(stream).not.toHaveBeenCalled()
  })

  test('missing records come back as plain errors', async () => {
    expect(await generateCvPlan({ jobId: 'nope', pages: 1 })).toEqual({ ok: false, error: 'This job no longer exists. Pick another one.' })
    expect((await draftBlockFromExperience({ experienceId: 'e-empty' })).ok).toBe(false)
    expect(stream).not.toHaveBeenCalled()
  })
})

describe('generateCvPlan', () => {
  test('returns a checked plan built only from library versions', async () => {
    replyWith({
      sectionOrder: ['PROJECT', 'EXPERIENCE'],
      showEducation: true,
      showSkills: true,
      showAchievements: false,
      items: [
        { versionId: 'v-bi-llm', section: 'PROJECT' },
        { versionId: 'v-visio-base', section: 'EXPERIENCE' },
        { versionId: 'invented', section: 'EXPERIENCE' },
      ],
      report: [{ tag: 'REUSED', text: 'BI Dashboard: made for this job.' }],
      asks: [],
    })
    const res = await generateCvPlan({ jobId: JOB.id, pages: 1 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.items.map((i) => i.versionId)).toEqual(['v-bi-llm', 'v-visio-base'])
      expect(res.data.report.at(-1)?.tag).toBe('NOTE')
    }
    const request = stream.mock.calls[0][0]
    expect(request.model).toBe('claude-opus-5-5')
    expect(request.system[0].text).toContain('Start every bullet with a verb.')
  })

  test('a refusal becomes a plain message', async () => {
    stream.mockReturnValueOnce({ finalMessage: async () => ({ stop_reason: 'refusal', content: [] }) })
    expect(await generateCvPlan({ jobId: JOB.id, pages: 2 })).toEqual({ ok: false, error: MESSAGES.refusal })
  })
})

describe('analyzeJob / analyzePosting', () => {
  const analysis = {
    requirements: [
      { id: 'r1', text: 'Python', status: 'covered', evidence: 'Visio AI', quotes: ['We want Python in production and RAG experience.', 'Ten years of Rust.'], keys: ['Python in production'] },
      { id: 'r2', text: 'RAG', status: 'missing', evidence: 'No block', quotes: [], keys: [] },
    ],
    asks: [{ id: 'q1', text: 'Built RAG?', experienceId: EXPERIENCE.id, requirementId: 'r2' }],
    drafts: [
      {
        blockId: null,
        newBlock: { name: 'RAG', section: 'PROJECT', org: '', location: '', dates: '', stack: '' },
        fromVersionId: null,
        title: 'RAG',
        bullets: [],
        improvedBy: 'q1',
        matches: [],
        note: 'Hint.',
      },
    ],
    reused: [{ versionId: 'v-bi-llm', why: 'Fits.', matches: [] }],
    leftOut: [],
    report: [],
    profileMatches: [],
  }

  test('the fixed contract maps statuses to covered', async () => {
    replyWith(analysis)
    const res = await analyzePosting({ jobId: JOB.id })
    expect(res.ok && res.data.requirements).toEqual([
      { text: 'Python', covered: true },
      { text: 'RAG', covered: false },
    ])
    expect(res.ok && res.data.drafts[0]).toEqual({ blockId: null, newBlock: analysis.drafts[0].newBlock, name: 'Base', title: 'RAG', bullets: [], waitingOn: null })
  })

  test('answers and change requests reach the prompt; output shape errors are caught', async () => {
    stream.mockReturnValueOnce({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"requirements": 3}' }] }) })
    const res = await analyzeJob({ jobId: JOB.id, answers: [{ id: 'q1', question: 'Built RAG?', answer: null }], instruction: 'shorter' })
    expect(res).toEqual({ ok: false, error: MESSAGES.invalid })
    const user = stream.mock.calls[0][0].messages[0].content[1].text as string
    expect(user).toContain('Don’t have it.')
    expect(user).toContain('shorter')
  })

  test('each gap question names the experience it is about; the prompt lists experiences by id', async () => {
    replyWith(analysis)
    const res = await analyzeJob({ jobId: JOB.id })
    expect(res.ok && res.data.asks).toEqual([{ id: 'q1', text: 'Built RAG?', experienceId: EXPERIENCE.id, requirementId: 'r2' }])
    // The saved posting text reaches finalizeAnalysis: the quote that is in it stays, the invented one is dropped.
    expect(res.ok && res.data.requirements[0]).toMatchObject({ quotes: ['We want Python in production and RAG experience.'], keys: ['Python in production'] })
    const context = stream.mock.calls[0][0].messages[0].content[0].text as string
    expect(context).toContain(`id="${EXPERIENCE.id}"`)
    expect(context).toContain('id="e-empty"')
  })

  test('a job without posting text asks for it first', async () => {
    loadJob.mockResolvedValueOnce({ ...JOB, postingText: '' })
    const res = await analyzeJob({ jobId: JOB.id })
    expect(res).toEqual({ ok: false, error: 'Read the job posting first: add its link and press Analyze, or paste the job text.' })
    expect(stream).not.toHaveBeenCalled()
  })
})

describe('answers and blocks', () => {
  test('draftAnswer returns the Portuguese text and at most 4 changes', async () => {
    replyWith({ text: ' Sou estudante… ', changes: ['a', 'b', 'c', 'd', 'e'] })
    const res = await draftAnswer({ questionId: QUESTION.id, jobId: JOB.id })
    expect(res).toEqual({ ok: true, data: { text: 'Sou estudante…', changes: ['a', 'b', 'c', 'd'] } })
  })

  test('draftBlockFromExperience drafts a version of the linked block', async () => {
    replyWith({ blockId: 'b-visio', newBlock: null, name: 'Python focus', title: 'Software Engineer Intern', bullets: [{ kind: 'STACK', text: 'Wrote 19 Python scripts.', want: null }] })
    const res = await draftBlockFromExperience({ experienceId: EXPERIENCE.id })
    expect(res.ok && res.data).toMatchObject({ blockId: 'b-visio', name: 'Python focus', waitingOn: null })
  })
})

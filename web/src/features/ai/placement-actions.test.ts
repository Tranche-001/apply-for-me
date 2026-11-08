// readPostingJobs and placeAnswers with the database and the AI client mocked: never calls the real API.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { EXPERIENCE, JOB } from './test-fixtures'
import { NOT_READY } from './provider'
import { draftVersionInput } from './draft-schema'
import type { Prompt } from './prompts'
import type { TaskConfig } from './run'
import type Anthropic from '@anthropic-ai/sdk'
import type { z } from 'zod'

const stream = vi.fn()
const getClient = vi.fn()

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
  loadLibrary: async () => [],
  loadProfile: async () => ({ education: [], skills: [], achievements: [] }),
  loadRules: async () => [],
  loadJob: async (id: string) => (id === JOB.id ? JOB : null),
  loadExperiences: async () => [EXPERIENCE],
  loadQuestion: async () => null,
}))

const { readPostingJobs, placeAnswers } = await import('./actions')

function replyWith(json: unknown) {
  stream.mockReturnValueOnce({ finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(json) }] }) })
}

beforeEach(() => {
  stream.mockReset()
  getClient.mockReset()
  getClient.mockReturnValue({ beta: { messages: { stream } } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const ITEMS = [{ askId: 'q1', question: 'Did you use Kafka?', answer: 'Yes, at Visio AI.' }]

const SINGLE = 'Acme is hiring a Backend Engineer to build things.'
const entry = (over = {}) => ({ company: '  Acme  ', role: 'Backend\nEngineer', location: '', kind: '', firstLine: 'Acme is hiring', lastLine: 'to build things.', lines: [], requirementCount: 3, isTrack: false, ...over })

describe('readPostingJobs', () => {
  test('one job: the tidy names and the whole text, asking with low effort and a small budget', async () => {
    replyWith({ jobs: [entry()], sharedHeadings: [] })
    const r = await readPostingJobs({ postingText: SINGLE })
    expect(r).toEqual({
      ok: true,
      data: [{ company: 'Acme', role: 'Backend Engineer', location: '', kind: '', text: SINGLE, lines: [], requirementCount: 3, track: false, startsWith: '', shared: [] }],
    })
    expect(stream.mock.calls[0][0].max_tokens).toBeLessThanOrEqual(4_000)
  })

  test('several jobs: each one with its own text, checked against the real posting', async () => {
    const text = 'Intro of Acme.\n\nBackend Engineer\nBuild APIs.\nRequirements: Go.\n\nSRE\nKeep it up.\nRequirements: Linux.'
    replyWith({
      jobs: [
        entry({ firstLine: 'Backend Engineer', lastLine: 'Requirements: Go.', lines: ['Build APIs.'] }),
        entry({ role: 'SRE', firstLine: 'SRE', lastLine: 'Requirements: Linux.', lines: ['Not in the text at all.'] }),
      ],
      sharedHeadings: [],
    })
    const r = await readPostingJobs({ postingText: text })
    expect(r.ok && r.data.map((j) => j.role)).toEqual(['Backend Engineer', 'SRE'])
    expect(r.ok && r.data[1].text).toBe('Intro of Acme.\n\nSRE\nKeep it up.\nRequirements: Linux.')
    expect(r.ok && r.data[1].lines).toEqual([])
  })

  test('without a key it says the AI is not ready and calls nothing', async () => {
    getClient.mockReturnValue(null)
    expect(await readPostingJobs({ postingText: SINGLE })).toEqual({ ok: false, error: NOT_READY })
    expect(stream).not.toHaveBeenCalled()
  })

  test('refuses an empty or huge posting before calling the AI', async () => {
    expect((await readPostingJobs({ postingText: '  ' })).ok).toBe(false)
    expect((await readPostingJobs({ postingText: 'x'.repeat(40_001) })).ok).toBe(false)
    expect(stream).not.toHaveBeenCalled()
  })

  test('an unusable reply is a plain error', async () => {
    replyWith({ nope: true })
    expect((await readPostingJobs({ postingText: SINGLE })).ok).toBe(false)
  })
})

describe('placeAnswers', () => {
  test('returns validated placements', async () => {
    replyWith({ placements: [{ askId: 'q1', experienceId: 'e-visio', alsoFits: ['ghost', 'e-visio'], why: 'It was at Visio AI.', newExperienceName: null }] })
    const r = await placeAnswers({ jobId: JOB.id, items: ITEMS })
    expect(r).toEqual({ ok: true, data: [{ askId: 'q1', experienceId: 'e-visio', alsoFits: [], why: 'It was at Visio AI.', newExperienceName: null }] })
  })

  test('the prompt carries the answers and the experiences', async () => {
    replyWith({ placements: [] })
    await placeAnswers({ jobId: JOB.id, items: ITEMS })
    const sent = JSON.stringify(stream.mock.calls[0][0])
    expect(sent).toContain('Yes, at Visio AI.')
    expect(sent).toContain('e-visio')
  })

  test('refuses bad input, a missing job and a missing key', async () => {
    expect((await placeAnswers({ jobId: JOB.id, items: [] })).ok).toBe(false)
    expect((await placeAnswers({ jobId: JOB.id, items: [{ askId: 'q1', question: 'Q', answer: ' ' }] })).ok).toBe(false)
    expect(await placeAnswers({ jobId: 'nope', items: ITEMS })).toEqual({ ok: false, error: 'This job no longer exists. Pick another one.' })
    getClient.mockReturnValue(null)
    expect(await placeAnswers({ jobId: JOB.id, items: ITEMS })).toEqual({ ok: false, error: NOT_READY })
  })
})

describe('draftVersionInput (shared with keepBlockDraft)', () => {
  const draft = { blockId: 'b1', newBlock: null, name: 'x', title: 't', bullets: [{ kind: 'PROJECT', text: 'ok', want: null }], waitingOn: null }

  test('still accepts what it accepted before and refuses a waiting draft', () => {
    expect(draftVersionInput.safeParse(draft).success).toBe(true)
    expect(draftVersionInput.safeParse({ ...draft, waitingOn: 'q1' }).success).toBe(false)
  })

  test('allows up to 12 bullets now', () => {
    const many = (n: number) => Array.from({ length: n }, () => draft.bullets[0])
    expect(draftVersionInput.safeParse({ ...draft, bullets: many(12) }).success).toBe(true)
    expect(draftVersionInput.safeParse({ ...draft, bullets: many(13) }).success).toBe(false)
  })
})

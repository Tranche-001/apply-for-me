// Experiences Server Functions with the database mocked: input checks, transaction options, refresh after commit.
// Never touches a real database.
import { beforeEach, describe, expect, test, vi } from 'vitest'

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  txOptions: vi.fn(),
  appendAnswerToExperience: vi.fn(),
  resendAnswerInExperience: vi.fn(),
  job: { findUnique: vi.fn() },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ refresh: m.refresh }))
vi.mock('./answers', () => ({ appendAnswerToExperience: m.appendAnswerToExperience, resendAnswerInExperience: m.resendAnswerInExperience }))
vi.mock('../ai/library-writes', () => ({ saveDraftToLibrary: vi.fn() }))
vi.mock('@/lib/db', () => {
  const tx = { job: m.job }
  return {
    db: {
      ...tx,
      $transaction: async (fn: (t: typeof tx) => unknown, options?: unknown) => {
        m.txOptions(options)
        return fn(tx)
      },
    },
  }
})

const { addAnswersToExperiences, resendAnswer } = await import('./actions')

const OLD_ENTRY = 'For Acme · SRE\nThe AI asked: Did you use RAG?\nMy answer: Yes.'
const resend = (over = {}) => ({ jobId: 'j1', experienceId: 'e1', oldEntry: OLD_ENTRY, question: 'Did you use RAG?', answer: 'Yes, twice.', ...over })

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.job.findUnique.mockResolvedValue({ company: 'Acme', role: 'SRE' })
})

describe('resendAnswer', () => {
  test('needs an old entry that has the shape of an answer entry', async () => {
    for (const oldEntry of ['just some notes', 'For Acme\nThe AI asked: \nMy answer: x', 'For Acme\nMy answer: x']) {
      const r = await resendAnswer(resend({ oldEntry }))
      expect(r.ok).toBe(false)
    }
    expect(m.job.findUnique).not.toHaveBeenCalled()
    expect(m.resendAnswerInExperience).not.toHaveBeenCalled()
  })

  test('an entry written by this app goes through, in a transaction with room to finish', async () => {
    m.resendAnswerInExperience.mockResolvedValue({ experienceId: 'e1', title: 'Visio AI', entry: 'x', replaced: true })
    const r = await resendAnswer(resend())
    expect(r.ok).toBe(true)
    expect(m.resendAnswerInExperience).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ oldEntry: OLD_ENTRY }))
    expect(m.txOptions).toHaveBeenCalledWith({ timeout: 30_000, maxWait: 5_000 })
  })

  test('a refresh that throws after the commit does not turn the write into a failure', async () => {
    m.resendAnswerInExperience.mockResolvedValue({ experienceId: 'e1', title: 'Visio AI', entry: 'x', replaced: true })
    m.refresh.mockImplementation(() => {
      throw new Error('refresh failed')
    })
    expect((await resendAnswer(resend())).ok).toBe(true)
  })
})

describe('addAnswersToExperiences', () => {
  test('runs in a transaction with room to finish', async () => {
    m.appendAnswerToExperience.mockResolvedValue({ experienceId: 'e1', title: 'Visio AI', added: true, entry: 'x', isNew: false })
    const r = await addAnswersToExperiences({ jobId: 'j1', items: [{ question: 'RAG?', answer: 'Yes', experienceId: 'e1' }] })
    expect(r.ok).toBe(true)
    expect(m.txOptions).toHaveBeenCalledWith({ timeout: 30_000, maxWait: 5_000 })
  })
})

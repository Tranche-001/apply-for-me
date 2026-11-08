// Job analysis v2 Server Functions with the database, the AI and the web fetch mocked.
// Never touches a real database.
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FetchResult } from './fetch-posting'
import { guessLinkKind, SESSION_VERSION, type AnalysisSession } from './types'

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  fetchPosting: vi.fn(),
  readPostingJobs: vi.fn(),
  draftBlockFromExperience: vi.fn(),
  appendAnswerToExperience: vi.fn(),
  saveDraftToLibrary: vi.fn(),
  updateVersionFromDraft: vi.fn(),
  saveTitleForJob: vi.fn(),
  writeCv: vi.fn(),
  txOptions: vi.fn(),
  job: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  block: { findUnique: vi.fn() },
  pairLibraryQuietly: vi.fn(),
  getAi: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ refresh: m.refresh }))
vi.mock('./fetch-posting', () => ({ fetchPosting: m.fetchPosting }))
vi.mock('../ai/actions', () => ({ readPostingJobs: m.readPostingJobs, draftBlockFromExperience: m.draftBlockFromExperience }))
vi.mock('../experiences/answers', () => ({ appendAnswerToExperience: m.appendAnswerToExperience }))
vi.mock('../ai/library-writes', () => ({ saveDraftToLibrary: m.saveDraftToLibrary, updateVersionFromDraft: m.updateVersionFromDraft, saveTitleForJob: m.saveTitleForJob }))
vi.mock('../cv/write-cv', () => ({ saveCvSchema: {}, writeCv: m.writeCv }))
vi.mock('../experiences/pairing', () => ({ pairLibraryQuietly: m.pairLibraryQuietly }))
vi.mock('../ai/client', () => ({ getAi: m.getAi }))
vi.mock('@/lib/db', () => {
  const tx = { job: m.job, block: m.block }
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

const { startFromPosting, continueFromLinks, startPickedJob, saveAnalysisSession, saveAnalysisCv, addExperienceForRequirement } = await import('./actions')
const { loadAnalysisJob } = await import('./queries')
const { UserError } = await import('../cv/action-result')

const POSTING = 'We are hiring a Backend Engineer at Acme. '.repeat(5)
const fetched = (over: Partial<Extract<FetchResult, { ok: true }>> = {}): FetchResult => ({ ok: true, url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Backend Engineer at Acme', text: POSTING, truncated: false, ...over })
const jobRow = (over = {}) => ({ id: 'j1', company: 'Acme', role: 'Backend Engineer', postingText: POSTING, links: [{ id: 'l1', kind: 'APPLICATION', url: 'https://boards.greenhouse.io/acme/jobs/1' }], ...over })

/** What readPostingJobs returns when the text holds one job. */
const oneJob = (company: string, role: string) => ({ ok: true, data: [{ company, role, location: '', kind: '', text: POSTING, lines: [], requirementCount: 0 }] })
const aJob = (over: Partial<Record<string, unknown>> = {}) => ({ company: 'ExampleCo', role: 'Senior GenAI Engineer', location: 'São Paulo (hybrid)', kind: 'Full-time', text: 'JOB A TEXT. '.repeat(10), lines: ['Design RAG pipelines.', 'Own vector search.'], requirementCount: 9, ...over })
/** The started job, failing the test when the result is an error or a split. */
function started(r: Awaited<ReturnType<typeof startFromPosting>>) {
  if (!r.ok || r.data.kind !== 'job') throw new Error(`expected a started job, got ${JSON.stringify(r)}`)
  return r.data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('startFromPosting', () => {
  test('pasted text must be 80 to 40,000 characters; nothing is read or asked', async () => {
    const short = await startFromPosting({ text: 'too short' })
    expect(short.ok).toBe(false)
    expect((await startFromPosting({ text: 'x'.repeat(40_001) })).ok).toBe(false)
    expect((await startFromPosting({} as { url: string })).ok).toBe(false)
    expect(m.readPostingJobs).not.toHaveBeenCalled()
    expect(m.fetchPosting).not.toHaveBeenCalled()
  })

  test('a link that is not allowed is refused before any fetch', async () => {
    const r = await startFromPosting({ url: 'http://localhost/job' })
    expect(r).toMatchObject({ ok: false })
    expect(m.fetchPosting).not.toHaveBeenCalled()
  })

  test('a blocked site says to paste the text, and no job is made', async () => {
    m.fetchPosting.mockResolvedValue({ ok: false, reason: 'blocked', message: 'linkedin.com does not let apps read it. Paste the job text instead.' })
    const r = await startFromPosting({ url: 'https://www.linkedin.com/jobs/view/1' })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/paste the job text/i) })
    expect(m.readPostingJobs).not.toHaveBeenCalled()
    expect(m.job.create).not.toHaveBeenCalled()
  })

  test('creates the job from a link: names from the AI, posting saved, link added with its kind', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.readPostingJobs).toHaveBeenCalledWith({ postingText: POSTING })
    expect(m.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { company: 'Acme', role: 'Backend Engineer', postingText: POSTING, links: { create: [{ url: 'https://boards.greenhouse.io/acme/jobs/1', kind: 'APPLICATION', position: 0 }] } },
      }),
    )
    expect(r).toEqual({
      ok: true,
      data: {
        kind: 'job',
        existed: false,
        postingText: POSTING,
        unread: [],
        job: { id: 'j1', company: 'Acme', role: 'Backend Engineer', label: 'Acme · Backend Engineer', links: [{ id: 'l1', kind: 'APPLICATION', url: 'https://boards.greenhouse.io/acme/jobs/1' }], postingChars: POSTING.length },
      },
    })
    expect(m.refresh).toHaveBeenCalled()
  })

  test('Analyze first pairs experiences and blocks in the background, with the AI in use', async () => {
    const ai = { provider: 'gemini' }
    m.getAi.mockReturnValue(ai)
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    started(await startFromPosting({ text: POSTING.padEnd(100, '.') }))
    expect(m.pairLibraryQuietly).toHaveBeenCalledWith(ai)
  })

  test('the job still starts while pairing is slow: both run side by side', async () => {
    let release = () => {}
    m.pairLibraryQuietly.mockReturnValue(new Promise<void>((resolve) => (release = resolve)))
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    const pending = startFromPosting({ text: POSTING.padEnd(100, '.') })
    await vi.waitFor(() => expect(m.readPostingJobs).toHaveBeenCalled())
    release()
    expect(started(await pending).existed).toBe(false)
  })

  test('pasted text makes a job with no link', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    const text = POSTING.padEnd(100, '.')
    const r = await startFromPosting({ text })
    expect(m.fetchPosting).not.toHaveBeenCalled()
    expect(m.job.create.mock.calls[0][0].data.links).toBeUndefined()
    expect(started(r).existed).toBe(false)
  })

  test('the same company and role reuses the job and says it existed; the link is not added twice', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: 'old' }))
    m.job.update.mockResolvedValue(jobRow())
    const r = await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.job.create).not.toHaveBeenCalled()
    const data = m.job.update.mock.calls[0][0].data
    expect(data.postingText).toBe(POSTING)
    expect(data.links).toBeUndefined()
    expect(started(r).existed).toBe(true)
  })

  test('a new link on an existing job is added after the others', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(jobRow({ links: [{ id: 'l0', kind: 'POSTING', url: 'https://other.example/job', position: 4 }] }))
    m.job.update.mockResolvedValue(jobRow())
    await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.job.update.mock.calls[0][0].data.links).toEqual({ create: [{ url: 'https://boards.greenhouse.io/acme/jobs/1', kind: 'APPLICATION', position: 5 }] })
  })

  const URL_A = 'https://boards.greenhouse.io/acme/jobs/1'
  const URL_B = 'https://jobs.acme.com/apply/1'
  const twoLinks = (blockB = false) =>
    m.fetchPosting.mockImplementation(async (url: string) =>
      url === URL_B && blockB ? { ok: false, message: 'Blocked. You can paste the job text instead.' } : fetched({ url, text: url === URL_A ? 'text A' : 'text B' }),
    )

  test('two links: both saved on a new job, the combined text goes to the AI', async () => {
    twoLinks()
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await startFromPosting({ urls: [URL_A, URL_B] })
    const combined = `From ${URL_A}:\ntext A\n\nFrom ${URL_B}:\ntext B`
    expect(m.readPostingJobs).toHaveBeenCalledWith({ postingText: combined })
    expect(m.job.create.mock.calls[0][0].data.links).toEqual({
      create: [
        { url: URL_A, kind: 'APPLICATION', position: 0 },
        { url: URL_B, kind: guessLinkKind(URL_B), position: 1 },
      ],
    })
    expect(r.ok && r.data.unread).toEqual([])
  })

  test('{ url } still works as one link', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    await startFromPosting({ url: URL_A })
    expect(m.job.create.mock.calls[0][0].data.links.create).toHaveLength(1)
  })

  test('one link that cannot be read: still starts from the other, saves both, returns unread', async () => {
    twoLinks(true)
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await startFromPosting({ urls: [URL_A, URL_B] })
    expect(m.readPostingJobs).toHaveBeenCalledWith({ postingText: 'text A' })
    expect(m.job.create.mock.calls[0][0].data.links.create).toHaveLength(2)
    expect(r.ok && r.data.unread).toEqual([{ url: URL_B, error: 'Blocked. You can paste the job text instead.' }])
  })

  test('an existing job gets only the typed links it does not have, after its own', async () => {
    twoLinks()
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(jobRow({ links: [{ id: 'l0', kind: 'APPLICATION', url: URL_A, position: 2 }] }))
    m.job.update.mockResolvedValue(jobRow())
    await startFromPosting({ urls: [URL_A, URL_B] })
    expect(m.job.update.mock.calls[0][0].data.links).toEqual({ create: [{ url: URL_B, kind: guessLinkKind(URL_B), position: 3 }] })
  })

  test('more than 5 links is a plain error and nothing is read', async () => {
    const urls = Array.from({ length: 6 }, (_, i) => `https://jobs.example.com/${i}`)
    const r = await startFromPosting({ urls })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/5 links/i) })
    expect(m.fetchPosting).not.toHaveBeenCalled()
  })

  test('no links, or only empty ones, is refused', async () => {
    expect((await startFromPosting({ urls: [] })).ok).toBe(false)
    expect((await startFromPosting({ urls: ['  '] })).ok).toBe(false)
    expect(m.fetchPosting).not.toHaveBeenCalled()
  })

  test('pasted text returns no unread links', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    const r = await startFromPosting({ text: POSTING })
    expect(r.ok && r.data.unread).toEqual([])
  })

  test('the AI not being ready is passed on and nothing is written', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readPostingJobs.mockResolvedValue({ ok: false, error: 'The AI is not set up yet.' })
    expect(await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })).toEqual({ ok: false, error: 'The AI is not set up yet.' })
    expect(m.job.create).not.toHaveBeenCalled()
    expect(m.job.update).not.toHaveBeenCalled()
  })

  test('no company: the job is stored under the role alone', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('', 'SRE'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ company: '', role: 'SRE', links: [] }))
    const r = await startFromPosting({ text: POSTING })
    expect(m.job.create.mock.calls[0][0].data).toMatchObject({ company: '', role: 'SRE' })
    expect(started(r).job.label).toBe('SRE')
  })

  test('no role: the page title stands in; with no title either, it says so', async () => {
    m.fetchPosting.mockResolvedValue(fetched({ title: 'Platform Engineer' }))
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', ''))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ role: 'Platform Engineer' }))
    await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.job.create.mock.calls[0][0].data.role).toBe('Platform Engineer')

    const r = await startFromPosting({ text: POSTING })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/which job/i) })
  })

  test.each([null, undefined, 'text', 42, []])('input %j is refused without throwing', async (input) => {
    await expect(startFromPosting(input as unknown as { url: string })).resolves.toMatchObject({ ok: false })
    expect(m.readPostingJobs).not.toHaveBeenCalled()
  })

  test('a new posting text on an existing job clears its saved session, so old quotes never point at text that is gone', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: 'the old posting' }))
    m.job.update.mockResolvedValue(jobRow())
    await startFromPosting({ text: POSTING })
    const data = m.job.update.mock.calls[0][0].data
    expect(data).toMatchObject({ postingText: POSTING.trim(), analysis: Prisma.DbNull, analyzedAt: null })
  })

  test('the same posting text keeps the saved session', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: POSTING.trim() }))
    m.job.update.mockResolvedValue(jobRow())
    await startFromPosting({ text: POSTING })
    const data = m.job.update.mock.calls[0][0].data
    expect('analysis' in data).toBe(false)
    expect('analyzedAt' in data).toBe(false)
  })

  test('losing a create race (P2002) reads the job the other request made and uses it', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(jobRow({ postingText: 'other' }))
    m.job.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    m.job.update.mockResolvedValue(jobRow())
    const r = await startFromPosting({ text: POSTING })
    expect(started(r).existed).toBe(true)
    expect(m.job.update).toHaveBeenCalledOnce()
  })

  test('a P2002 with no job to be found is still a plain error', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    expect((await startFromPosting({ text: POSTING })).ok).toBe(false)
  })

  test('a database failure is a plain message', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'SRE'))
    m.job.findUnique.mockRejectedValue(Object.assign(new Error('x'), { code: 'P1001' }))
    const r = await startFromPosting({ text: POSTING })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('database') })
  })
})

describe('startFromPosting: more than one job in what was read', () => {
  const twoJobs = () =>
    m.readPostingJobs.mockResolvedValue({ ok: true, data: [aJob(), aJob({ role: 'ML Platform Engineer', location: 'Remote (Brazil)', kind: '', text: 'JOB B TEXT. '.repeat(10), lines: ['Run the platform.'], requirementCount: 7 })] })

  test('creates nothing and returns the candidates with the typed links and the unread ones', async () => {
    const URL_A = 'https://boards.greenhouse.io/acme/jobs/1'
    const URL_B = 'https://jobs.acme.com/apply/1'
    m.fetchPosting.mockImplementation(async (url: string) => (url === URL_B ? { ok: false, message: 'Blocked. You can paste the job text instead.' } : fetched({ url })))
    twoJobs()
    const r = await startFromPosting({ urls: [URL_A, URL_B] })
    expect(r).toEqual({
      ok: true,
      data: {
        kind: 'split',
        urls: [URL_A, URL_B],
        unread: [{ url: URL_B, error: 'Blocked. You can paste the job text instead.' }],
        source: 'link',
        candidates: [
          { id: 'c1', company: 'ExampleCo', role: 'Senior GenAI Engineer', meta: 'ExampleCo · São Paulo (hybrid) · Full-time', lines: ['Design RAG pipelines.', 'Own vector search.'], requirementCount: 9, text: 'JOB A TEXT. '.repeat(10), track: false, startsWith: '', shared: [] },
          { id: 'c2', company: 'ExampleCo', role: 'ML Platform Engineer', meta: 'ExampleCo · Remote (Brazil)', lines: ['Run the platform.'], requirementCount: 7, text: 'JOB B TEXT. '.repeat(10), track: false, startsWith: '', shared: [] },
        ],
      },
    })
    expect(m.job.findUnique).not.toHaveBeenCalled()
    expect(m.job.create).not.toHaveBeenCalled()
    expect(m.job.update).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  test('pasted text: split with no links; a missing company or place is left out of the meta', async () => {
    m.readPostingJobs.mockResolvedValue({ ok: true, data: [aJob({ company: '', location: '', kind: '' }), aJob({ role: 'SRE', company: 'Acme', kind: 'Contract', location: '' })] })
    const r = await startFromPosting({ text: POSTING })
    expect(r.ok && r.data.kind === 'split' && r.data.urls).toEqual([])
    expect(r.ok && r.data.kind === 'split' && r.data.source).toBe('text')
    expect(r.ok && r.data.kind === 'split' && r.data.candidates.map((c) => c.meta)).toEqual(['', 'Acme · Contract'])
    expect(m.job.create).not.toHaveBeenCalled()
  })

  test('the job is still named from the single entry when there is only one', async () => {
    m.readPostingJobs.mockResolvedValue({ ok: true, data: [aJob({ text: POSTING })] })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ company: 'ExampleCo', role: 'Senior GenAI Engineer', links: [] }))
    const r = await startFromPosting({ text: POSTING })
    expect(started(r).existed).toBe(false)
    expect(m.job.create.mock.calls[0][0].data).toMatchObject({ company: 'ExampleCo', role: 'Senior GenAI Engineer', postingText: POSTING.trim() })
  })
})

describe('startPickedJob', () => {
  const URL_A = 'https://boards.greenhouse.io/acme/jobs/1'
  const TEXT = 'JOB A TEXT. '.repeat(10)
  const pick = (over = {}) => ({ company: 'ExampleCo', role: 'Senior GenAI Engineer', text: TEXT, urls: [URL_A], ...over })

  test('creates the job with the picked text and every link', async () => {
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ company: 'ExampleCo', role: 'Senior GenAI Engineer', postingText: TEXT.trim() }))
    const r = await startPickedJob(pick())
    expect(m.readPostingJobs).not.toHaveBeenCalled()
    expect(m.job.create.mock.calls[0][0].data).toEqual({ company: 'ExampleCo', role: 'Senior GenAI Engineer', postingText: TEXT.trim(), links: { create: [{ url: URL_A, kind: 'APPLICATION', position: 0 }] } })
    expect(r).toMatchObject({ ok: true, data: { kind: 'job', existed: false, postingText: TEXT.trim(), unread: [] } })
    expect(m.refresh).toHaveBeenCalled()
  })

  test('the same company and role reuses the job, adds only the new links and clears a session that quoted another text', async () => {
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: 'old text', links: [{ id: 'l0', kind: 'APPLICATION', url: URL_A, position: 0 }] }))
    m.job.update.mockResolvedValue(jobRow())
    const URL_B = 'https://jobs.acme.com/apply/1'
    const r = await startPickedJob(pick({ urls: [URL_A, URL_B] }))
    expect(m.job.create).not.toHaveBeenCalled()
    const data = m.job.update.mock.calls[0][0].data
    expect(data).toMatchObject({ postingText: TEXT.trim(), analysis: Prisma.DbNull, analyzedAt: null })
    expect(data.links).toEqual({ create: [{ url: URL_B, kind: guessLinkKind(URL_B), position: 1 }] })
    expect(started(r).existed).toBe(true)
  })

  test('the same posting text keeps the saved session', async () => {
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: TEXT.trim() }))
    m.job.update.mockResolvedValue(jobRow())
    await startPickedJob(pick({ urls: [] }))
    expect('analysis' in m.job.update.mock.calls[0][0].data).toBe(false)
  })

  test('no links is fine (the text was pasted)', async () => {
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    await startPickedJob(pick({ urls: [] }))
    expect(m.job.create.mock.calls[0][0].data.links).toBeUndefined()
  })

  test('losing a create race (P2002) uses the job the other request made', async () => {
    m.job.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(jobRow({ postingText: 'other' }))
    m.job.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    m.job.update.mockResolvedValue(jobRow())
    expect(started(await startPickedJob(pick())).existed).toBe(true)
  })

  test.each([
    ['company over 120', { company: 'c'.repeat(121) }],
    ['no role', { role: '  ' }],
    ['role over 160', { role: 'r'.repeat(161) }],
    ['text under 80', { text: 'too short' }],
    ['text over 40,000', { text: 'x'.repeat(40_001) }],
    ['more than 5 links', { urls: Array.from({ length: 6 }, (_, i) => `https://jobs.example.com/${i}`) }],
    ['a link that is not allowed', { urls: ['http://localhost/job'] }],
    ['a link that is not a link', { urls: ['not a link'] }],
    ['urls not a list', { urls: 'https://a.example.com' }],
  ])('invalid input (%s) is a plain error and nothing is written', async (_name, over) => {
    const r = await startPickedJob(pick(over) as Parameters<typeof startPickedJob>[0])
    expect(r).toEqual({ ok: false, error: expect.any(String) })
    expect(m.job.findUnique).not.toHaveBeenCalled()
    expect(m.job.create).not.toHaveBeenCalled()
  })

  test.each([null, undefined, 'text', 42, []])('input %j is refused without throwing', async (input) => {
    await expect(startPickedJob(input as unknown as Parameters<typeof startPickedJob>[0])).resolves.toMatchObject({ ok: false })
  })

  test('a database failure is a plain message', async () => {
    m.job.findUnique.mockRejectedValue(Object.assign(new Error('x'), { code: 'P1001' }))
    expect(await startPickedJob(pick())).toEqual({ ok: false, error: expect.stringContaining('database') })
  })
})

describe('links that look like the same job', () => {
  const URL_A = 'https://carreiras.example.com/gen-ai/'
  const URL_B = 'https://carreiras.example.com/job/1/'
  const SHARED = [
    'Programa de Estágio - GenAI com duas trilhas',
    'Construir agentes com LLMs em produção para milhões de pedidos.',
    'Criar soluções de IA para as áreas de negócio da empresa.',
    'Estar regularmente matriculado em curso superior de tecnologia.',
  ].join('\n')
  const TEXT_A = `${SHARED}\nProcesso seletivo em quatro etapas ao longo do semestre.`
  const TEXT_B = SHARED
  const readBoth = () => m.fetchPosting.mockImplementation(async (url: string) => fetched({ url, text: url === URL_A ? TEXT_A : TEXT_B }))

  test('two links that repeat each other: the question comes back, the AI is not asked and nothing is saved', async () => {
    readBoth()
    const r = await startFromPosting({ urls: [URL_A, URL_B] })
    expect(r).toEqual({
      ok: true,
      data: {
        kind: 'overlap',
        links: [
          { url: URL_A, text: TEXT_A },
          { url: URL_B, text: TEXT_B },
        ],
        share: 1,
        urls: [URL_A, URL_B],
        unread: [],
        title: 'Backend Engineer at Acme',
      },
    })
    expect(m.readPostingJobs).not.toHaveBeenCalled()
    expect(m.job.create).not.toHaveBeenCalled()
  })

  const answer = (same: boolean, over: Record<string, unknown> = {}) => ({
    same,
    links: [
      { url: URL_A, text: TEXT_A },
      { url: URL_B, text: TEXT_B },
    ],
    urls: [URL_A, URL_B],
    title: null,
    ...over,
  })

  test('Same job: one copy of the text (the longest) goes to the AI; both links are saved on the job; nothing is read again', async () => {
    m.readPostingJobs.mockResolvedValue(oneJob('Acme', 'Backend Engineer'))
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await continueFromLinks(answer(true))
    expect(m.fetchPosting).not.toHaveBeenCalled()
    expect(m.readPostingJobs).toHaveBeenCalledWith({ postingText: TEXT_A })
    expect(m.job.create.mock.calls[0][0].data.links.create.map((l: { url: string }) => l.url)).toEqual([URL_A, URL_B])
    expect(started(r).postingText).toBe(TEXT_A)
  })

  test('Different jobs: the texts stay apart, each after its link, and may go on to "Which job?"', async () => {
    m.readPostingJobs.mockResolvedValue({ ok: true, data: [aJob(), aJob({ role: 'ML Platform Engineer' })] })
    const r = await continueFromLinks(answer(false))
    expect(m.readPostingJobs).toHaveBeenCalledWith({ postingText: `From ${URL_A}:\n${TEXT_A}\n\nFrom ${URL_B}:\n${TEXT_B}` })
    expect(r.ok && r.data.kind === 'split' && r.data.source).toBe('links')
    expect(r.ok && r.data.kind === 'split' && r.data.urls).toEqual([URL_A, URL_B])
  })

  test('the texts sent back are validated: sizes, links that are not public, a link not among the job’s links', async () => {
    expect((await continueFromLinks(answer(true, { links: [{ url: URL_A, text: 'x'.repeat(40_001) }, { url: URL_B, text: TEXT_B }] }))).ok).toBe(false)
    expect((await continueFromLinks(answer(true, { links: [{ url: URL_A, text: TEXT_A }] }))).ok).toBe(false)
    expect((await continueFromLinks(answer(true, { urls: ['http://localhost/x', URL_B] }))).ok).toBe(false)
    expect((await continueFromLinks(answer(true, { links: [{ url: 'https://evil.example/x', text: TEXT_A }, { url: URL_B, text: TEXT_B }] }))).ok).toBe(false)
    expect((await continueFromLinks(answer(true, { urls: Array.from({ length: 6 }, (_, i) => `https://a.example/${i}`) }))).ok).toBe(false)
    expect(m.readPostingJobs).not.toHaveBeenCalled()
  })

  test.each([null, undefined, 'text', 42, {}, { same: 'yes' }])('input %j is refused without throwing', async (input) => {
    await expect(continueFromLinks(input as unknown as Parameters<typeof continueFromLinks>[0])).resolves.toMatchObject({ ok: false })
  })
})

const emptySession: AnalysisSession = {
  v: SESSION_VERSION,
  analysis: { requirements: [], asks: [], drafts: [], reused: [], leftOut: [], report: [] },
  answers: {},
  dont: {},
  sent: {},
  drafts: [],
  asIsOut: [],
  pages: 1,
  step: 'input',
  analyzedAt: '2026-11-07T10:00:00.000Z',
  savedAt: null,
}

describe('saveAnalysisSession', () => {
  test('stores the validated session and analyzedAt, selects only analyzedAt, and does not refresh', async () => {
    m.job.update.mockResolvedValue({ analyzedAt: new Date('2026-11-07T10:00:00.000Z') })
    const r = await saveAnalysisSession({ jobId: 'j1', session: emptySession })
    expect(r).toEqual({ ok: true, data: null })
    const arg = m.job.update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'j1' })
    expect(arg.data.analysis).toEqual(emptySession)
    expect(arg.data.analyzedAt).toEqual(new Date('2026-11-07T10:00:00.000Z'))
    expect(arg.select).toEqual({ analyzedAt: true })
    expect(m.refresh).not.toHaveBeenCalled()
  })

  test('unknown keys are dropped before storing', async () => {
    m.job.update.mockResolvedValue({ analyzedAt: null })
    await saveAnalysisSession({ jobId: 'j1', session: { ...emptySession, secret: 'x' } })
    expect(m.job.update.mock.calls[0][0].data.analysis).not.toHaveProperty('secret')
  })

  test('an invalid session is refused and nothing is written', async () => {
    for (const session of [null, { ...emptySession, v: 1 }, { ...emptySession, pages: 3 }, { ...emptySession, step: 'done' }, 'text']) {
      expect((await saveAnalysisSession({ jobId: 'j1', session })).ok).toBe(false)
    }
    expect((await saveAnalysisSession({ jobId: '', session: emptySession })).ok).toBe(false)
    expect(m.job.update).not.toHaveBeenCalled()
  })

  test('an analyzedAt that is not a date is refused', async () => {
    const r = await saveAnalysisSession({ jobId: 'j1', session: { ...emptySession, analyzedAt: 'yesterday' } })
    expect(r.ok).toBe(false)
    expect(m.job.update).not.toHaveBeenCalled()
  })

  test('a deleted job is a plain message', async () => {
    m.job.update.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2025' }))
    expect(await saveAnalysisSession({ jobId: 'j1', session: emptySession })).toEqual({ ok: false, error: expect.stringContaining('deleted') })
  })
})

describe('loadAnalysisJob', () => {
  test('reads the session explicitly and returns it with the posting text', async () => {
    m.job.findUnique.mockResolvedValue({ ...jobRow(), analysis: emptySession, analyzedAt: new Date('2026-11-07T10:00:00.000Z') })
    const r = await loadAnalysisJob('j1')
    expect(m.job.findUnique.mock.calls[0][0].select).toMatchObject({ analysis: true, analyzedAt: true, postingText: true })
    expect(r).toMatchObject({ postingText: POSTING, session: emptySession, analyzedAt: '2026-11-07T10:00:00.000Z', job: { id: 'j1', label: 'Acme · Backend Engineer' } })
  })

  test('an old or invalid session is null', async () => {
    m.job.findUnique.mockResolvedValue({ ...jobRow(), analysis: { v: 1, junk: true }, analyzedAt: null })
    const r = await loadAnalysisJob('j1')
    expect(r).toMatchObject({ session: null, analyzedAt: null })
  })

  test('no session yet is null; a missing job is null', async () => {
    m.job.findUnique.mockResolvedValueOnce({ ...jobRow(), analysis: null, analyzedAt: null })
    expect((await loadAnalysisJob('j1'))?.session).toBeNull()
    m.job.findUnique.mockResolvedValueOnce(null)
    expect(await loadAnalysisJob('nope')).toBeNull()
  })
})

const cv = (items: { section: 'EXPERIENCE' | 'PROJECT'; position: number; versionId: string }[]) => ({
  pages: 1 as const,
  sectionOrder: ['EXPERIENCE', 'PROJECT'] as ('EXPERIENCE' | 'PROJECT')[],
  showEducation: true,
  showSkills: true,
  showAchievements: false,
  items,
})
const kept = (over = {}) => ({
  key: 'd1',
  blockId: 'b1',
  newBlock: null,
  name: 'Acme · SRE',
  title: 'Engineer',
  bullets: [{ kind: 'PROJECT' as const, text: 'Built X.', want: null }],
  waitingOn: null,
  saveAs: 'new' as const,
  fromVersionId: 'v1',
  ...over,
})

describe('saveAnalysisCv', () => {
  beforeEach(() => {
    m.job.findUnique.mockResolvedValue({ id: 'j1' })
    m.writeCv.mockResolvedValue({ savedLabel: 'Saved Nov 7' })
  })

  test('saves each draft, maps the draft ids in the CV, writes the CV and touches the job, in one go', async () => {
    m.saveDraftToLibrary.mockResolvedValue({ blockId: 'b1', blockName: 'Visio', versionId: 'v-new', versionName: 'Acme · SRE', isNewBlock: false })
    m.updateVersionFromDraft.mockResolvedValue({ blockId: 'b2', blockName: 'BI', versionId: 'v-upd', versionName: 'Base', isNewBlock: false })
    const r = await saveAnalysisCv({
      jobId: 'j1',
      drafts: [kept(), kept({ key: 'd2', blockId: 'b2', saveAs: 'update', fromVersionId: 'v-upd' })],
      cv: cv([
        { section: 'EXPERIENCE', position: 0, versionId: 'draft:d1' },
        { section: 'PROJECT', position: 1, versionId: 'draft:d2' },
        { section: 'PROJECT', position: 2, versionId: 'draft:ghost' },
        { section: 'PROJECT', position: 3, versionId: 'v-as-is' },
      ]),
    })
    expect(m.saveDraftToLibrary).toHaveBeenCalledOnce()
    expect(m.saveDraftToLibrary.mock.calls[0][2]).toEqual({ jobId: 'j1' })
    expect(m.updateVersionFromDraft).toHaveBeenCalledWith(expect.anything(), 'v-upd', expect.objectContaining({ blockId: 'b2' }))
    expect(m.writeCv).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: 'j1',
        pages: 1,
        items: [
          { section: 'EXPERIENCE', position: 0, versionId: 'v-new' },
          { section: 'PROJECT', position: 1, versionId: 'v-upd' },
          { section: 'PROJECT', position: 2, versionId: 'v-as-is' },
        ],
      }),
    )
    expect(m.job.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'j1' } }))
    expect(r).toEqual({
      ok: true,
      data: {
        saved: [expect.objectContaining({ versionId: 'v-new' }), expect.objectContaining({ versionId: 'v-upd' })],
        savedLabel: 'Saved Nov 7',
        idMap: { 'draft:d1': 'v-new', 'draft:d2': 'v-upd' },
      },
    })
    expect(m.refresh).toHaveBeenCalledOnce()
  })

  test('"update" on a draft with no source version is saved as a new version', async () => {
    m.saveDraftToLibrary.mockResolvedValue({ blockId: 'b1', blockName: 'Visio', versionId: 'v-new', versionName: 'x', isNewBlock: false })
    await saveAnalysisCv({ jobId: 'j1', drafts: [kept({ saveAs: 'update', fromVersionId: null })], cv: cv([]) })
    expect(m.updateVersionFromDraft).not.toHaveBeenCalled()
    expect(m.saveDraftToLibrary).toHaveBeenCalledOnce()
  })

  test('works with no drafts: only the CV is saved', async () => {
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [], cv: cv([{ section: 'EXPERIENCE', position: 0, versionId: 'v1' }]) })
    expect(r.ok).toBe(true)
    expect(m.saveDraftToLibrary).not.toHaveBeenCalled()
  })

  test('one section ("Experience & Projects") reaches the CV that is written', async () => {
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [], cv: { ...cv([{ section: 'EXPERIENCE', position: 0, versionId: 'v1' }]), oneSection: true } })
    expect(r.ok).toBe(true)
    expect(m.writeCv.mock.calls[0][1]).toMatchObject({ jobId: 'j1', oneSection: true })
  })

  test('invalid drafts are refused before the transaction', async () => {
    const bad = [kept({ waitingOn: 'q1' }), kept({ blockId: null }), kept({ bullets: Array.from({ length: 13 }, () => ({ kind: 'IMPACT', text: 'x', want: null })) })]
    for (const d of bad) expect((await saveAnalysisCv({ jobId: 'j1', drafts: [d], cv: cv([]) })).ok).toBe(false)
    expect(m.job.findUnique).not.toHaveBeenCalled()
  })

  test('a deleted job is a plain message and nothing is saved', async () => {
    m.job.findUnique.mockResolvedValue(null)
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [kept()], cv: cv([]) })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('no longer exists') })
    expect(m.saveDraftToLibrary).not.toHaveBeenCalled()
    expect(m.refresh).not.toHaveBeenCalled()
  })

  test('a message from writeCv reaches the screen as it is', async () => {
    m.writeCv.mockRejectedValue(new UserError('A version in this CV was removed from your library.'))
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [], cv: cv([]) })
    expect(r).toEqual({ ok: false, error: 'A version in this CV was removed from your library.' })
    expect(m.refresh).not.toHaveBeenCalled()
  })

  test('two drafts with the same key are refused before the transaction', async () => {
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [kept(), kept({ blockId: 'b2' })], cv: cv([]) })
    expect(r.ok).toBe(false)
    expect(m.job.findUnique).not.toHaveBeenCalled()
  })

  test('the transaction gets room to finish: 30 s, 5 s to start', async () => {
    await saveAnalysisCv({ jobId: 'j1', drafts: [], cv: cv([]) })
    expect(m.txOptions).toHaveBeenCalledWith({ timeout: 30_000, maxWait: 5_000 })
  })

  test('a version id like "constructor" or "__proto__" stays itself and does not resolve to an inherited property', async () => {
    const r = await saveAnalysisCv({
      jobId: 'j1',
      drafts: [],
      cv: cv([
        { section: 'EXPERIENCE', position: 0, versionId: 'constructor' },
        { section: 'PROJECT', position: 1, versionId: '__proto__' },
      ]),
    })
    expect(r.ok).toBe(true)
    expect(m.writeCv.mock.calls[0][1].items.map((i: { versionId: string }) => i.versionId)).toEqual(['constructor', '__proto__'])
  })

  test('an item id may be a draft id of a 80-character key', async () => {
    const key = 'k'.repeat(80)
    m.saveDraftToLibrary.mockResolvedValue({ blockId: 'b1', blockName: 'Visio', versionId: 'v-new', versionName: 'x', isNewBlock: false })
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [kept({ key })], cv: cv([{ section: 'EXPERIENCE', position: 0, versionId: `draft:${key}` }]) })
    expect(r.ok).toBe(true)
  })

  test('a refresh that fails after the commit does not turn the save into a failure', async () => {
    m.refresh.mockImplementation(() => {
      throw new Error('refresh failed')
    })
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [], cv: cv([]) })
    expect(r.ok).toBe(true)
  })

  test('a version used as it is with another role title gets a version for this job, named after the job, in the CV', async () => {
    m.job.findUnique.mockResolvedValue({ id: 'j1', company: 'iFood', role: 'AI Builder' })
    m.saveTitleForJob.mockResolvedValue({ blockId: 'b1', blockName: 'Visio', versionId: 'v-titled', versionName: 'iFood · AI Builder', isNewBlock: false })
    const r = await saveAnalysisCv({
      jobId: 'j1',
      drafts: [],
      cv: cv([
        { section: 'EXPERIENCE', position: 0, versionId: 'v-visio' },
        { section: 'PROJECT', position: 1, versionId: 'v-bi' },
      ]),
      retitled: [{ versionId: 'v-visio', title: ' AI Builder ' }],
    })
    expect(m.saveTitleForJob).toHaveBeenCalledWith(expect.anything(), 'v-visio', 'AI Builder', { jobId: 'j1', name: 'iFood · AI Builder' })
    expect(m.writeCv.mock.calls[0][1].items.map((i: { versionId: string }) => i.versionId)).toEqual(['v-titled', 'v-bi'])
    expect(r.ok && r.data.saved).toEqual([expect.objectContaining({ versionId: 'v-titled' })])
  })

  test('role titles for drafts, twice for one version, or empty are refused before the transaction', async () => {
    const bad = [[{ versionId: 'draft:d1', title: 'X' }], [{ versionId: 'v1', title: 'X' }, { versionId: 'v1', title: 'Y' }], [{ versionId: 'v1', title: '  ' }]]
    for (const retitled of bad) expect((await saveAnalysisCv({ jobId: 'j1', drafts: [], cv: cv([]), retitled })).ok).toBe(false)
    expect(m.job.findUnique).not.toHaveBeenCalled()
  })

  test('a version that disappeared while updating is a plain message', async () => {
    m.updateVersionFromDraft.mockRejectedValue(new Error('block-missing'))
    const r = await saveAnalysisCv({ jobId: 'j1', drafts: [kept({ saveAs: 'update' })], cv: cv([]) })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('deleted') })
  })
})

describe('addExperienceForRequirement', () => {
  const input = { jobId: 'j1', requirementId: 'r3', requirementName: 'Kafka', experienceId: 'e1', newExperienceTitle: null, text: 'I ran Kafka at Visio AI.' }
  const draft = { blockId: 'b1', newBlock: null, name: 'Kafka focus', title: 'Engineer', bullets: [], waitingOn: null }
  const placed = { experienceId: 'e1', title: 'Visio AI', added: true, entry: 'For Acme\n...', isNew: false }

  beforeEach(() => {
    m.job.findUnique.mockResolvedValue({ company: 'Acme', role: 'SRE' })
    m.appendAnswerToExperience.mockResolvedValue(placed)
    m.draftBlockFromExperience.mockResolvedValue({ ok: true, data: draft })
    m.block.findUnique.mockResolvedValue({ name: 'Visio AI', versions: [{ id: 'v1', name: 'Base' }] })
  })

  test('adds the text to the chosen experience and returns the placed answer and a draft for the requirement', async () => {
    const r = await addExperienceForRequirement(input)
    const [, experienceId, entry, options] = m.appendAnswerToExperience.mock.calls[0]
    expect(experienceId).toBe('e1')
    expect(entry).toContain('Experience that shows “Kafka”')
    expect(entry).toContain('I ran Kafka at Visio AI.')
    expect(options).toEqual({ newExperienceTitle: null })
    expect(m.draftBlockFromExperience).toHaveBeenCalledWith({ experienceId: 'e1' })
    expect(r).toMatchObject({
      ok: true,
      data: { placed, draft: { key: 'add-r3', improvedBy: null, fromVersionId: 'v1', blockName: 'Visio AI', matches: [{ requirementId: 'r3', phrases: [], partly: false }] } },
    })
    expect(m.refresh).toHaveBeenCalled()
  })

  test('creates a new experience when asked', async () => {
    m.appendAnswerToExperience.mockResolvedValue({ ...placed, experienceId: 'e-new', title: 'Study Rats', isNew: true })
    m.draftBlockFromExperience.mockResolvedValue({ ok: true, data: { ...draft, blockId: null, newBlock: { name: 'Study Rats', section: 'PROJECT', org: '', location: '', dates: '', stack: '' } } })
    const r = await addExperienceForRequirement({ ...input, experienceId: null, newExperienceTitle: 'Study Rats' })
    expect(m.appendAnswerToExperience.mock.calls[0][1]).toBeNull()
    expect(m.appendAnswerToExperience.mock.calls[0][3]).toEqual({ newExperienceTitle: 'Study Rats' })
    expect(m.block.findUnique).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: true, data: { draft: { fromVersionId: null, blockName: 'Study Rats' } } })
  })

  test('needs an experience or a title for a new one, and some text', async () => {
    expect((await addExperienceForRequirement({ ...input, experienceId: null })).ok).toBe(false)
    expect((await addExperienceForRequirement({ ...input, text: '   ' })).ok).toBe(false)
    expect(m.appendAnswerToExperience).not.toHaveBeenCalled()
  })

  test('when the AI cannot draft, the error says the text was kept', async () => {
    m.draftBlockFromExperience.mockResolvedValue({ ok: false, error: 'The AI is not set up yet.' })
    const r = await addExperienceForRequirement(input)
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/added to “Visio AI”.*The AI is not set up yet\./) })
    expect(m.refresh).toHaveBeenCalled()
  })

  test('a deleted job is a plain message', async () => {
    m.job.findUnique.mockResolvedValue(null)
    expect((await addExperienceForRequirement(input)).ok).toBe(false)
    expect(m.appendAnswerToExperience).not.toHaveBeenCalled()
  })
})

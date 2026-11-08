// Job analysis v2 Server Functions with the database, the AI and the web fetch mocked.
// Never touches a real database.
import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FetchResult } from './fetch-posting'
import { guessLinkKind, SESSION_VERSION, type AnalysisSession } from './types'

const m = vi.hoisted(() => ({
  refresh: vi.fn(),
  fetchPosting: vi.fn(),
  readJobInfo: vi.fn(),
  draftBlockFromExperience: vi.fn(),
  appendAnswerToExperience: vi.fn(),
  saveDraftToLibrary: vi.fn(),
  updateVersionFromDraft: vi.fn(),
  writeCv: vi.fn(),
  txOptions: vi.fn(),
  job: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  block: { findUnique: vi.fn() },
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ refresh: m.refresh }))
vi.mock('./fetch-posting', () => ({ fetchPosting: m.fetchPosting }))
vi.mock('../ai/actions', () => ({ readJobInfo: m.readJobInfo, draftBlockFromExperience: m.draftBlockFromExperience }))
vi.mock('../experiences/answers', () => ({ appendAnswerToExperience: m.appendAnswerToExperience }))
vi.mock('../ai/library-writes', () => ({ saveDraftToLibrary: m.saveDraftToLibrary, updateVersionFromDraft: m.updateVersionFromDraft }))
vi.mock('../cv/write-cv', () => ({ saveCvSchema: {}, writeCv: m.writeCv }))
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

const { startFromPosting, saveAnalysisSession, saveAnalysisCv, addExperienceForRequirement } = await import('./actions')
const { loadAnalysisJob } = await import('./queries')
const { UserError } = await import('../cv/action-result')

const POSTING = 'We are hiring a Backend Engineer at Acme. '.repeat(5)
const fetched = (over: Partial<Extract<FetchResult, { ok: true }>> = {}): FetchResult => ({ ok: true, url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Backend Engineer at Acme', text: POSTING, truncated: false, ...over })
const jobRow = (over = {}) => ({ id: 'j1', company: 'Acme', role: 'Backend Engineer', postingText: POSTING, links: [{ id: 'l1', kind: 'APPLICATION', url: 'https://boards.greenhouse.io/acme/jobs/1' }], ...over })

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
    expect(m.readJobInfo).not.toHaveBeenCalled()
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
    expect(m.readJobInfo).not.toHaveBeenCalled()
    expect(m.job.create).not.toHaveBeenCalled()
  })

  test('creates the job from a link: names from the AI, posting saved, link added with its kind', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.readJobInfo).toHaveBeenCalledWith({ postingText: POSTING })
    expect(m.job.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { company: 'Acme', role: 'Backend Engineer', postingText: POSTING, links: { create: [{ url: 'https://boards.greenhouse.io/acme/jobs/1', kind: 'APPLICATION', position: 0 }] } },
      }),
    )
    expect(r).toEqual({
      ok: true,
      data: {
        existed: false,
        postingText: POSTING,
        unread: [],
        job: { id: 'j1', company: 'Acme', role: 'Backend Engineer', label: 'Acme · Backend Engineer', links: [{ id: 'l1', kind: 'APPLICATION', url: 'https://boards.greenhouse.io/acme/jobs/1' }], postingChars: POSTING.length },
      },
    })
    expect(m.refresh).toHaveBeenCalled()
  })

  test('pasted text makes a job with no link', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    const text = POSTING.padEnd(100, '.')
    const r = await startFromPosting({ text })
    expect(m.fetchPosting).not.toHaveBeenCalled()
    expect(m.job.create.mock.calls[0][0].data.links).toBeUndefined()
    expect(r.ok && r.data.existed).toBe(false)
  })

  test('the same company and role reuses the job and says it existed; the link is not added twice', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: 'old' }))
    m.job.update.mockResolvedValue(jobRow())
    const r = await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.job.create).not.toHaveBeenCalled()
    const data = m.job.update.mock.calls[0][0].data
    expect(data.postingText).toBe(POSTING)
    expect(data.links).toBeUndefined()
    expect(r.ok && r.data.existed).toBe(true)
  })

  test('a new link on an existing job is added after the others', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
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
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await startFromPosting({ urls: [URL_A, URL_B] })
    const combined = `From ${URL_A}:\ntext A\n\nFrom ${URL_B}:\ntext B`
    expect(m.readJobInfo).toHaveBeenCalledWith({ postingText: combined })
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
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    await startFromPosting({ url: URL_A })
    expect(m.job.create.mock.calls[0][0].data.links.create).toHaveLength(1)
  })

  test('one link that cannot be read: still starts from the other, saves both, returns unread', async () => {
    twoLinks(true)
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow())
    const r = await startFromPosting({ urls: [URL_A, URL_B] })
    expect(m.readJobInfo).toHaveBeenCalledWith({ postingText: 'text A' })
    expect(m.job.create.mock.calls[0][0].data.links.create).toHaveLength(2)
    expect(r.ok && r.data.unread).toEqual([{ url: URL_B, error: 'Blocked. You can paste the job text instead.' }])
  })

  test('an existing job gets only the typed links it does not have, after its own', async () => {
    twoLinks()
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
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
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ links: [] }))
    const r = await startFromPosting({ text: POSTING })
    expect(r.ok && r.data.unread).toEqual([])
  })

  test('the AI not being ready is passed on and nothing is written', async () => {
    m.fetchPosting.mockResolvedValue(fetched())
    m.readJobInfo.mockResolvedValue({ ok: false, error: 'The AI is not set up yet.' })
    expect(await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })).toEqual({ ok: false, error: 'The AI is not set up yet.' })
    expect(m.job.create).not.toHaveBeenCalled()
    expect(m.job.update).not.toHaveBeenCalled()
  })

  test('no company: the job is stored under the role alone', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: '', role: 'SRE' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ company: '', role: 'SRE', links: [] }))
    const r = await startFromPosting({ text: POSTING })
    expect(m.job.create.mock.calls[0][0].data).toMatchObject({ company: '', role: 'SRE' })
    expect(r.ok && r.data.job.label).toBe('SRE')
  })

  test('no role: the page title stands in; with no title either, it says so', async () => {
    m.fetchPosting.mockResolvedValue(fetched({ title: 'Platform Engineer' }))
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: '' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockResolvedValue(jobRow({ role: 'Platform Engineer' }))
    await startFromPosting({ url: 'https://boards.greenhouse.io/acme/jobs/1' })
    expect(m.job.create.mock.calls[0][0].data.role).toBe('Platform Engineer')

    const r = await startFromPosting({ text: POSTING })
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/which job/i) })
  })

  test.each([null, undefined, 'text', 42, []])('input %j is refused without throwing', async (input) => {
    await expect(startFromPosting(input as unknown as { url: string })).resolves.toMatchObject({ ok: false })
    expect(m.readJobInfo).not.toHaveBeenCalled()
  })

  test('a new posting text on an existing job clears its saved session, so old quotes never point at text that is gone', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: 'the old posting' }))
    m.job.update.mockResolvedValue(jobRow())
    await startFromPosting({ text: POSTING })
    const data = m.job.update.mock.calls[0][0].data
    expect(data).toMatchObject({ postingText: POSTING.trim(), analysis: Prisma.DbNull, analyzedAt: null })
  })

  test('the same posting text keeps the saved session', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(jobRow({ postingText: POSTING.trim() }))
    m.job.update.mockResolvedValue(jobRow())
    await startFromPosting({ text: POSTING })
    const data = m.job.update.mock.calls[0][0].data
    expect('analysis' in data).toBe(false)
    expect('analyzedAt' in data).toBe(false)
  })

  test('losing a create race (P2002) reads the job the other request made and uses it', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(jobRow({ postingText: 'other' }))
    m.job.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    m.job.update.mockResolvedValue(jobRow())
    const r = await startFromPosting({ text: POSTING })
    expect(r.ok && r.data.existed).toBe(true)
    expect(m.job.update).toHaveBeenCalledOnce()
  })

  test('a P2002 with no job to be found is still a plain error', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'Backend Engineer' } })
    m.job.findUnique.mockResolvedValue(null)
    m.job.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    expect((await startFromPosting({ text: POSTING })).ok).toBe(false)
  })

  test('a database failure is a plain message', async () => {
    m.readJobInfo.mockResolvedValue({ ok: true, data: { company: 'Acme', role: 'SRE' } })
    m.job.findUnique.mockRejectedValue(Object.assign(new Error('x'), { code: 'P1001' }))
    const r = await startFromPosting({ text: POSTING })
    expect(r).toEqual({ ok: false, error: expect.stringContaining('database') })
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

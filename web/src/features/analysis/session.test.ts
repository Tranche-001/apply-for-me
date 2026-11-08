import { describe, expect, test } from 'vitest'
import type { AnalysisDraft, JobAnalysis, LeftOutVersion } from '../ai/types'
import { analysisSessionSchema, fitAnalysis, parseSession, SESSION_LIMITS } from './session'
import { SESSION_VERSION, type AnalysisSession, type SessionDraft } from './types'

const draft: AnalysisDraft = {
  key: 'd1',
  blockId: 'b1',
  newBlock: null,
  blockName: 'Visio AI',
  name: 'iFood · GenAI Engineer',
  title: 'AI Intern',
  bullets: [
    { kind: 'PROJECT', text: 'Built X.', want: null },
    { kind: 'MISSING', text: 'RAG: your answer to q1 can fill this', want: 'IMPACT' },
  ],
  waitingOn: null,
  note: 'Leads with AI.',
  fromVersionId: 'v1',
  fromVersionName: 'Base',
  improvedBy: 'q1',
  matches: [{ requirementId: 'r1', phrases: ['Built X'], partly: false }],
}

const left: LeftOutVersion = {
  versionId: 'v2',
  blockId: 'b2',
  blockName: 'BI Dashboard',
  versionName: 'Base',
  section: 'PROJECT',
  title: 'BI',
  org: '',
  location: '',
  dates: '',
  stack: 'n8n',
  bullets: [{ kind: 'IMPACT', text: 'Cut time.', want: null }],
  why: 'Not about AI.',
  matches: [],
}

const analysis: JobAnalysis = {
  requirements: [{ id: 'r1', text: 'Python', status: 'covered', evidence: 'Visio AI', quotes: ['We want Python.'], keys: ['Python'] }],
  asks: [{ id: 'q1', text: 'RAG?', experienceId: 'e1', requirementId: 'r1' }],
  drafts: [draft],
  reused: [{ ...left, versionId: 'v3', why: 'Fits.' }],
  leftOut: [left],
  report: [{ tag: 'NEW', text: 'One new version.' }],
}

const sessionDraft: SessionDraft = { ...draft, keep: true, editedByHand: false, saveAs: 'new' }

const session = (over: Partial<AnalysisSession> = {}): AnalysisSession => ({
  v: SESSION_VERSION,
  analysis,
  answers: { q1: 'Yes, with pgvector.' },
  dont: { q2: true },
  sent: {
    q1: { question: 'RAG?', answer: 'Yes, with pgvector.', entry: 'Yes, with pgvector.', experienceId: 'e1', experienceTitle: 'Visio AI', isNewExperience: false, resent: false },
  },
  drafts: [sessionDraft],
  asIsOut: ['v3'],
  pages: 1,
  step: 'drafts',
  analyzedAt: '2026-11-07T12:00:00.000Z',
  savedAt: null,
  ...over,
})

describe('parseSession: profile evidence', () => {
  const evidence = { requirementId: 'r1', kind: 'education' as const, title: 'B.S. Information Systems', dates: '2023 – 2027', detail: 'USP', phrases: ['Information Systems'], partly: false }

  test('an old session without profile evidence still loads; a new one keeps it', () => {
    const old = session()
    expect('profile' in old.analysis).toBe(false)
    expect(parseSession(old)).not.toBeNull()
    expect(parseSession(session({ analysis: { ...old.analysis, profile: [evidence] } }))?.analysis.profile).toEqual([evidence])
  })

  test('a bad kind is refused', () => {
    expect(parseSession(session({ analysis: { ...session().analysis, profile: [{ ...evidence, kind: 'hobby' as 'education' }] } }))).toBeNull()
  })
})

describe('parseSession', () => {
  test('accepts a valid session and returns it unchanged', () => {
    expect(parseSession(session())).toEqual(session())
  })

  test('survives a JSON round trip (what the database stores)', () => {
    expect(parseSession(JSON.parse(JSON.stringify(session({ savedAt: '2026-11-07T13:00:00.000Z', step: 'saved', pages: 2 }))))).not.toBeNull()
  })

  test.each([null, undefined, 42, 'text', [], {}])('returns null for %j', (value) => {
    expect(parseSession(value)).toBeNull()
  })

  test('returns null for another session version', () => {
    expect(parseSession({ ...session(), v: 1 })).toBeNull()
    expect(parseSession({ ...session(), v: 3 })).toBeNull()
  })

  test('returns null when a field has the wrong type or value', () => {
    expect(parseSession({ ...session(), pages: 3 })).toBeNull()
    expect(parseSession({ ...session(), step: 'done' })).toBeNull()
    expect(parseSession({ ...session(), answers: { q1: 5 } })).toBeNull()
    expect(parseSession({ ...session(), analyzedAt: undefined })).toBeNull()
    expect(parseSession({ ...session(), drafts: [{ ...sessionDraft, saveAs: 'maybe' }] })).toBeNull()
  })

  test('returns null for the old shape of a draft (waitingOn text, no matches)', () => {
    const { matches: _matches, ...oldDraft } = sessionDraft
    expect(parseSession({ ...session(), drafts: [oldDraft] })).toBeNull()
  })

  test('never throws, even on a circular object', () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(() => parseSession(loop)).not.toThrow()
    expect(parseSession(loop)).toBeNull()
  })

  test('caps the lists', () => {
    const reqs = Array.from({ length: 21 }, (_, i) => ({ ...analysis.requirements[0], id: `r${i}` }))
    expect(parseSession(session({ analysis: { ...analysis, requirements: reqs } }))).toBeNull()
    const asks = Array.from({ length: 9 }, (_, i) => ({ ...analysis.asks[0], id: `q${i}` }))
    expect(parseSession(session({ analysis: { ...analysis, asks } }))).toBeNull()
    const drafts = Array.from({ length: 21 }, (_, i) => ({ ...draft, key: `d${i}` }))
    expect(parseSession(session({ analysis: { ...analysis, drafts } }))).toBeNull()
    const leftOut = Array.from({ length: 21 }, (_, i) => ({ ...left, versionId: `v${i}` }))
    expect(parseSession(session({ analysis: { ...analysis, leftOut } }))).toBeNull()
    expect(parseSession(session({ analysis: { ...analysis, requirements: reqs.slice(0, 20) } }))).not.toBeNull()
  })

  test('rejects a very long string and a session over 300,000 characters', () => {
    expect(parseSession(session({ answers: { q1: 'x'.repeat(20_000) } }))).toBeNull()
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...draft,
      key: `d${i}`,
      bullets: Array.from({ length: 6 }, () => ({ kind: 'PROJECT' as const, text: 'y'.repeat(1000), want: null })),
    }))
    const big = session({ analysis: { ...analysis, drafts: many }, drafts: many.map((d) => ({ ...d, keep: true, editedByHand: false, saveAs: 'new' as const })) })
    expect(JSON.stringify(big).length).toBeGreaterThan(240_000)
    const huge = { ...big, answers: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`q${i}`, 'z'.repeat(5000)])) }
    expect(parseSession(huge)).toBeNull()
  })

  test('keeps Unicode and emoji text', () => {
    const s = session({ answers: { q1: 'Usei RAG — “pgvector” 🚀 ção' } })
    expect(parseSession(s)?.answers.q1).toBe('Usei RAG — “pgvector” 🚀 ção')
  })
})

describe('analysisSessionSchema', () => {
  test('is a zod schema that safeParses', () => {
    expect(analysisSessionSchema.safeParse(session()).success).toBe(true)
  })
})

describe('fitAnalysis', () => {
  const oversized = (): JobAnalysis => ({
    requirements: Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`,
      text: 'T'.repeat(400),
      status: 'missing' as const,
      evidence: 'e'.repeat(3000),
      quotes: ['q'.repeat(1500), 'short quote', 'b', 'c'],
      keys: ['k'.repeat(400), ...Array.from({ length: 14 }, (_, j) => `key${j}`)],
    })),
    asks: Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, text: 'a'.repeat(2500), requirementId: i === 0 ? 'r24' : 'r1' })),
    drafts: Array.from({ length: 22 }, (_, i) => ({
      ...draft,
      key: `d${i}`,
      title: 'x'.repeat(400),
      improvedBy: i === 0 ? 'q9' : 'q1',
      bullets: Array.from({ length: 10 }, () => ({ kind: 'PROJECT' as const, text: 'y'.repeat(1200), want: null })),
      matches: [
        { requirementId: 'r1', phrases: ['p'.repeat(1200), 'ok phrase'], partly: false },
        { requirementId: 'r24', phrases: ['gone'], partly: false },
      ],
    })),
    reused: Array.from({ length: 22 }, (_, i) => ({ ...left, versionId: `u${i}`, why: 'w'.repeat(2500) })),
    leftOut: [],
    report: Array.from({ length: 70 }, () => ({ tag: 'NOTE' as const, text: 'n'.repeat(100) })),
  })

  test('an oversized analysis passes the session schema once fitted', () => {
    const big = oversized()
    expect(parseSession(session({ analysis: big, drafts: [] }))).toBeNull()
    const fitted = fitAnalysis(big)
    expect(analysisSessionSchema.safeParse(session({ analysis: fitted, drafts: [] })).success).toBe(true)
    expect(parseSession(session({ analysis: fitted, drafts: [] }))).not.toBeNull()
    expect(fitted.requirements).toHaveLength(SESSION_LIMITS.requirements)
    expect(fitted.requirements[0].text).toHaveLength(300)
    expect(fitted.requirements[0].text.endsWith('…')).toBe(true)
  })

  test('drops quotes, keys and phrases over their length instead of cutting them', () => {
    const fitted = fitAnalysis(oversized())
    expect(fitted.requirements[0].quotes).toEqual(['short quote', 'b', 'c'])
    expect(fitted.requirements[0].keys).toHaveLength(SESSION_LIMITS.keys)
    expect(fitted.requirements[0].keys).not.toContain('k'.repeat(400))
    expect(fitted.drafts[1].matches[0].phrases).toEqual(['ok phrase'])
  })

  test('leaves no reference to a requirement or question that was cut', () => {
    const fitted = fitAnalysis(oversized())
    expect(fitted.asks[0].requirementId).toBeNull()
    expect(fitted.drafts[0].improvedBy).toBeNull()
    expect(fitted.drafts[1].matches.map((m) => m.requirementId)).toEqual(['r1'])
  })

  test('an analysis that already fits comes back equal', () => {
    expect(fitAnalysis(analysis)).toEqual(analysis)
  })
})

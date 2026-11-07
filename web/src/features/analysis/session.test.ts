import { describe, expect, test } from 'vitest'
import type { AnalysisDraft, JobAnalysis, LeftOutVersion } from '../ai/types'
import { analysisSessionSchema, parseSession } from './session'
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

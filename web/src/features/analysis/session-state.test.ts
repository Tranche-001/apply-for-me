import { describe, expect, test } from 'vitest'
import type { AnalysisDraft, JobAnalysis, ReusedVersion } from '../ai/types'
import {
  addDraft,
  answeredCount,
  applyRedraft,
  discardDraft,
  editAsIs,
  markSaved,
  markSent,
  newSession,
  pipelineStep,
  restoreDraft,
  setAnswer,
  setDont,
  setKeep,
  toggleAsIsOut,
  updateDraft,
} from './session-state'
import type { SentAnswer } from './types'

const NOW = '2026-11-07T10:42:00.000Z'

const draft = (over: Partial<AnalysisDraft>): AnalysisDraft => ({
  key: 'd1',
  blockId: 'b-bi',
  newBlock: null,
  name: 'ExampleCo · Senior GenAI Engineer',
  title: 'AI-Powered Business Intelligence Platform',
  bullets: [{ kind: 'PROJECT_IMPACT', text: 'Built an LLM pipeline', want: null }],
  waitingOn: null,
  blockName: 'BI Dashboard',
  note: 'Leads with Gemini.',
  fromVersionId: 'v-bi-llm',
  fromVersionName: 'LLM pipeline',
  improvedBy: 'q1',
  matches: [],
  ...over,
})

const reused = (over: Partial<ReusedVersion> = {}): ReusedVersion => ({
  versionId: 'v-rats',
  blockId: 'b-rats',
  blockName: 'Study Rats',
  versionName: 'Web Full-Stack',
  section: 'EXPERIENCE',
  title: 'Tech Lead, Full-Stack — Study Rats',
  org: 'Codelab USP',
  location: 'São Carlos, SP',
  dates: 'March 2026 – Present',
  stack: '',
  bullets: [{ kind: 'PROJECT_STACK', text: 'Led a 7-engineer team', want: null }],
  why: 'Shows team leadership.',
  matches: [{ requirementId: 'r6', phrases: ['Led a 7-engineer team'], partly: false }],
  ...over,
})

const analysis = (over: Partial<JobAnalysis> = {}): JobAnalysis => ({
  requirements: [],
  asks: [
    { id: 'q1', text: 'RAG?', requirementId: 'r1' },
    { id: 'q2', text: 'Evals?', requirementId: 'r3' },
  ],
  drafts: [draft({})],
  reused: [reused()],
  leftOut: [],
  report: [],
  ...over,
})

const sent = (over: Partial<SentAnswer> = {}): SentAnswer => ({
  question: 'RAG?',
  answer: 'Yes, at Visio AI.',
  entry: 'For ExampleCo · Senior GenAI Engineer\nThe AI asked: RAG?\nMy answer: Yes, at Visio AI.',
  experienceId: 'e-visio',
  experienceTitle: 'Visio AI',
  isNewExperience: false,
  resent: false,
  ...over,
})

describe('newSession', () => {
  test('starts on the answers step with every draft kept and nothing sent', () => {
    const s = newSession(analysis(), NOW)
    expect(s.step).toBe('input')
    expect(s.drafts).toHaveLength(1)
    expect(s.drafts[0]).toMatchObject({ key: 'd1', keep: true, editedByHand: false, saveAs: 'new' })
    expect(s.sent).toEqual({})
    expect(s.pages).toBe(1)
    expect(s.analyzedAt).toBe(NOW)
    expect(s.savedAt).toBeNull()
  })
})

describe('answers', () => {
  test('typing an answer counts it as answered; "I don’t have this" counts too', () => {
    let s = newSession(analysis(), NOW)
    expect(answeredCount(s)).toBe(0)
    s = setAnswer(s, 'q1', 'Yes')
    s = setDont(s, 'q2', true)
    expect(answeredCount(s)).toBe(2)
  })

  test('a blank answer does not count', () => {
    const s = setAnswer(newSession(analysis(), NOW), 'q1', '   ')
    expect(answeredCount(s)).toBe(0)
  })

  test('does not change the session it was given', () => {
    const s = newSession(analysis(), NOW)
    setAnswer(s, 'q1', 'Yes')
    expect(s.answers).toEqual({})
  })

  test('markSent records where the answer went', () => {
    const s = markSent(newSession(analysis(), NOW), 'q1', sent())
    expect(s.sent.q1.experienceTitle).toBe('Visio AI')
  })
})

describe('drafts', () => {
  test('editing the title or bullets marks the draft as edited by hand', () => {
    const s = updateDraft(newSession(analysis(), NOW), 'd1', { title: 'Shorter title' })
    expect(s.drafts[0]).toMatchObject({ title: 'Shorter title', editedByHand: true })
  })

  test('changing only Save as does not count as an edit', () => {
    const s = updateDraft(newSession(analysis(), NOW), 'd1', { saveAs: 'update' })
    expect(s.drafts[0]).toMatchObject({ saveAs: 'update', editedByHand: false })
  })

  test('discard removes the draft and undo puts it back where it was', () => {
    const base = addDraft(newSession(analysis(), NOW), draft({ key: 'd2', blockId: 'b-visio', blockName: 'Visio AI' }))
    const { session, undo } = discardDraft(base, 'd1')
    expect(session.drafts.map((d) => d.key)).toEqual(['d2'])
    expect(restoreDraft(session, undo).drafts.map((d) => d.key)).toEqual(['d1', 'd2'])
  })

  test('keep can be switched off and on', () => {
    const s = setKeep(newSession(analysis(), NOW), 'd1', false)
    expect(s.drafts[0].keep).toBe(false)
  })

  test('addDraft gives a clashing key a new one', () => {
    const s = addDraft(newSession(analysis(), NOW), draft({ key: 'd1', blockId: null, newBlock: { name: 'Kafka project', section: 'PROJECT', org: '', location: '', dates: '', stack: 'Kafka' } }))
    expect(new Set(s.drafts.map((d) => d.key)).size).toBe(2)
  })
})

describe('blocks used as they are', () => {
  test('× leaves a block out of this CV and a second click brings it back', () => {
    const out = toggleAsIsOut(newSession(analysis(), NOW), 'v-rats')
    expect(out.asIsOut).toEqual(['v-rats'])
    expect(toggleAsIsOut(out, 'v-rats').asIsOut).toEqual([])
  })

  test('editing one turns it into a new version for this job and takes the as-is copy out', () => {
    const s = editAsIs(newSession(analysis(), NOW), reused(), { name: 'ExampleCo · Senior GenAI Engineer', title: 'Tech Lead — Study Rats', bullets: [{ kind: 'IMPACT', text: 'Led 7 engineers', want: null }], saveAs: 'new' })
    expect(s.asIsOut).toContain('v-rats')
    const made = s.drafts.find((d) => d.fromVersionId === 'v-rats')
    expect(made).toMatchObject({ blockId: 'b-rats', blockName: 'Study Rats', title: 'Tech Lead — Study Rats', editedByHand: true, keep: true, fromVersionName: 'Web Full-Stack' })
    expect(made?.matches).toEqual(reused().matches)
  })
})

describe('applyRedraft keeps an answered question tied to its requirement', () => {
  const quoted = (id: string, text: string, quotes: string[]) => ({ id, text, status: 'partial' as const, evidence: '', quotes, keys: [] })
  const RAG = 'Design, build and run retrieval-augmented generation (RAG) pipelines in production.'

  test('when the AI rewords the requirement, the shared posting quote still links them', () => {
    let s = newSession(analysis({ requirements: [quoted('r1', 'RAG pipelines in production', [RAG])] }), NOW)
    s = setAnswer(s, 'q1', 'Yes, at Visio AI.')
    const next = analysis({ asks: [], requirements: [quoted('r4', 'Production RAG pipelines with pgvector', [RAG])] })
    const r = applyRedraft(s, next, NOW)
    expect(r.analysis.asks.find((a) => a.id === 'q1')?.requirementId).toBe('r4')
  })

  test('with neither the same text nor a shared quote, the link is dropped', () => {
    let s = newSession(analysis({ requirements: [quoted('r1', 'RAG pipelines in production', [RAG])] }), NOW)
    s = setAnswer(s, 'q1', 'Yes.')
    const r = applyRedraft(s, analysis({ asks: [], requirements: [quoted('r4', 'Kafka', ['Experience with Kafka.'])] }), NOW)
    expect(r.analysis.asks.find((a) => a.id === 'q1')?.requirementId).toBeNull()
  })
})

describe('applyRedraft', () => {
  test('replaces drafts you did not touch and keeps the ones you edited by hand', () => {
    const edited = updateDraft(newSession(analysis(), NOW), 'd1', { title: 'My own title' })
    const next = analysis({ drafts: [draft({ title: 'AI title again' }), draft({ key: 'd2', blockId: 'b-visio', blockName: 'Visio AI', title: 'Visio new' })] })
    const s = applyRedraft(edited, next, '2026-11-07T11:00:00.000Z')
    expect(s.drafts.map((d) => d.title)).toEqual(['My own title', 'Visio new'])
    expect(s.analyzedAt).toBe('2026-11-07T11:00:00.000Z')
  })

  test('keeps answers, sent answers and a Keep you switched off', () => {
    let s = newSession(analysis(), NOW)
    s = setAnswer(s, 'q1', 'Yes')
    s = markSent(s, 'q1', sent())
    s = setKeep(s, 'd1', false)
    const r = applyRedraft(s, analysis({ drafts: [draft({ title: 'New AI title' })] }), NOW)
    expect(r.answers.q1).toBe('Yes')
    expect(r.sent.q1.experienceId).toBe('e-visio')
    expect(r.drafts[0]).toMatchObject({ title: 'New AI title', keep: false })
  })

  test('an edited draft whose block the AI no longer drafts stays at the end', () => {
    const s = updateDraft(newSession(analysis(), NOW), 'd1', { title: 'Mine' })
    const r = applyRedraft(s, analysis({ drafts: [draft({ key: 'd1', blockId: 'b-visio', blockName: 'Visio AI' })] }), NOW)
    expect(r.drafts.map((d) => d.blockName)).toEqual(['Visio AI', 'BI Dashboard'])
    expect(new Set(r.drafts.map((d) => d.key)).size).toBe(2)
  })

  test('moves from answering to the drafts step and drops left-out versions the AI no longer reuses', () => {
    const s = toggleAsIsOut(newSession(analysis(), NOW), 'v-rats')
    const r = applyRedraft(s, analysis({ reused: [] }), NOW)
    expect(r.step).toBe('drafts')
    expect(r.asIsOut).toEqual([])
  })
})

describe('applyRedraft: questions', () => {
  const ask = (id: string, text: string) => ({ id, text, requirementId: null })
  const answered = (asks: { id: string; text: string; requirementId: null }[], drafts = [draft({})]) => {
    let s = newSession(analysis({ asks, drafts }), NOW)
    s = setAnswer(s, 'q1', 'Yes, at Visio AI.')
    return markSent(s, 'q1', sent())
  }

  test('an answered question the AI no longer asks is kept with its answer and its sent entry', () => {
    const s = answered([ask('q1', 'RAG?'), ask('q2', 'Evals?')])
    const r = applyRedraft(s, analysis({ asks: [ask('q3', 'Kafka?')], drafts: [] }), NOW)
    expect(r.analysis.asks.map((a) => a.id)).toEqual(['q1', 'q3'])
    expect(r.answers).toEqual({ q1: 'Yes, at Visio AI.' })
    expect(r.sent.q1.answer).toBe('Yes, at Visio AI.')
  })

  test('a new question reusing an answered id gets a free id and its draft.improvedBy follows it', () => {
    const s = answered([ask('q1', 'RAG?')])
    const next = analysis({ asks: [ask('q1', 'Kafka?')], drafts: [draft({ improvedBy: 'q1' })] })
    const r = applyRedraft(s, next, NOW)
    expect(r.analysis.asks).toEqual([ask('q1', 'RAG?'), expect.objectContaining({ id: 'q2', text: 'Kafka?' })])
    expect(r.drafts[0].improvedBy).toBe('q2')
    expect(r.answers.q2).toBeUndefined()
  })

  test('the same question re-asked with a new id merges into the old one', () => {
    const s = answered([ask('q1', 'RAG?')])
    const next = analysis({ asks: [ask('q7', '  rag?  ')], drafts: [draft({ improvedBy: 'q7' })] })
    const r = applyRedraft(s, next, NOW)
    expect(r.analysis.asks.map((a) => a.id)).toEqual(['q1'])
    expect(r.drafts[0].improvedBy).toBe('q1')
  })

  test('unanswered old questions the AI dropped leave no empty answer state behind', () => {
    let s = newSession(analysis({ asks: [ask('q1', 'RAG?'), ask('q2', 'Evals?')] }), NOW)
    s = setAnswer(s, 'q2', '   ')
    s = setDont(s, 'q2', false)
    const r = applyRedraft(s, analysis({ asks: [ask('q5', 'Kafka?')], drafts: [] }), NOW)
    expect(r.analysis.asks.map((a) => a.id)).toEqual(['q5'])
    expect(r.answers).toEqual({})
    expect(r.dont).toEqual({})
  })

  test('"I don’t have this" also keeps the question', () => {
    const s = setDont(newSession(analysis({ asks: [ask('q1', 'RAG?')] }), NOW), 'q1', true)
    const r = applyRedraft(s, analysis({ asks: [], drafts: [] }), NOW)
    expect(r.analysis.asks.map((a) => a.id)).toEqual(['q1'])
    expect(r.dont).toEqual({ q1: true })
  })

  test('never holds more questions than a session may save', () => {
    const many = Array.from({ length: 8 }, (_, i) => ask(`n${i}`, `New ${i}?`))
    const r = applyRedraft(answered([ask('q1', 'RAG?')]), analysis({ asks: many, drafts: [draft({ improvedBy: 'n7' })] }), NOW)
    expect(r.analysis.asks).toHaveLength(8)
    expect(r.drafts[0].improvedBy).toBeNull()
  })
})

describe('applyRedraft: drafts you made or edited', () => {
  const req = (id: string, text: string) => ({ id, text, status: 'missing' as const, evidence: '', quotes: [], keys: [] })

  test('two edited drafts of one block both survive; each takes one slot', () => {
    let s = newSession(analysis({ drafts: [draft({ key: 'd1' })] }), NOW)
    s = addDraft(s, draft({ key: 'd2', title: 'Second' }), true)
    s = updateDraft(updateDraft(s, 'd1', { title: 'Mine 1' }), 'd2', { title: 'Mine 2' })
    const r = applyRedraft(s, analysis({ drafts: [draft({ key: 'd1', title: 'AI new' })] }), NOW)
    expect(r.drafts.map((d) => d.title)).toEqual(['Mine 1', 'Mine 2'])
    expect(new Set(r.drafts.map((d) => d.key)).size).toBe(2)
  })

  test('a draft added with + Add experience survives even when not edited', () => {
    const added = draft({ key: 'add-r4', blockId: 'b-new', blockName: 'Kafka', title: 'Kafka work' })
    const s = addDraft(newSession(analysis(), NOW), added, true)
    const r = applyRedraft(s, analysis({ drafts: [draft({ title: 'AI again' })] }), NOW)
    expect(r.drafts.map((d) => d.key)).toEqual(['d1', 'add-r4'])
    expect(r.drafts[0].title).toBe('AI again')
  })

  test('an unticked block stays unticked for the new AI draft of the same block', () => {
    const s = setKeep(newSession(analysis(), NOW), 'd1', false)
    const r = applyRedraft(s, analysis({ drafts: [draft({ key: 'x' })] }), NOW)
    expect(r.drafts[0].keep).toBe(false)
  })

  test('carried-over matches follow the requirement text; ones with no counterpart are dropped', () => {
    const matches = [
      { requirementId: 'r1', phrases: ['a'], partly: false },
      { requirementId: 'r2', phrases: ['b'], partly: true },
    ]
    const old = analysis({ requirements: [req('r1', 'Python  in production'), req('r2', 'Kafka')], drafts: [draft({ matches })] })
    const s = updateDraft(newSession(old, NOW), 'd1', { title: 'Mine' })
    const next = analysis({ requirements: [req('r9', 'python in production')], drafts: [] })
    const r = applyRedraft(s, next, NOW)
    expect(r.drafts[0].matches).toEqual([{ requirementId: 'r9', phrases: ['a'], partly: false }])
  })

  test('a carried draft whose question was dropped no longer points at a question', () => {
    const old = analysis({ asks: [ask0('q1', 'RAG?')], drafts: [draft({ improvedBy: 'q1' })] })
    const s = updateDraft(newSession(old, NOW), 'd1', { title: 'Mine' })
    const r = applyRedraft(s, analysis({ asks: [ask0('q1', 'Kafka?')], drafts: [] }), NOW)
    expect(r.drafts[0].improvedBy).toBeNull()
  })
})

const ask0 = (id: string, text: string) => ({ id, text, requirementId: null })

describe('pipelineStep', () => {
  test('maps the session to the step pills: answering 2, drafts 3, review 4, saved 5', () => {
    const s = newSession(analysis(), NOW)
    expect(pipelineStep(s)).toBe(2)
    expect(pipelineStep({ ...s, step: 'drafts' })).toBe(3)
    expect(pipelineStep({ ...s, step: 'review' })).toBe(4)
    expect(pipelineStep(markSaved({ ...s, step: 'review' }, NOW))).toBe(5)
  })
})

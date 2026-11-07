import { describe, expect, test } from 'vitest'
import type { AnalysisDraft, JobAnalysis, LeftOutVersion, ReusedVersion } from '../../ai/types'
import type { LibBlock } from '../../blocks/types'
import { newSession, toggleAsIsOut } from '../session-state'
import { blockViews, chipItems, editTargetForCvBlock, findView, hitsFor, nameLookup, topicFor } from './view-model'

const NOW = '2026-11-07T10:42:00.000Z'

const view = (over: Partial<ReusedVersion>): ReusedVersion => ({
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
  why: 'Shows leadership.',
  matches: [{ requirementId: 'r-lead', phrases: ['Led a 7-engineer team'], partly: false }],
  ...over,
})

const draft = (over: Partial<AnalysisDraft>): AnalysisDraft => ({
  key: 'd1',
  blockId: 'b-visio',
  newBlock: null,
  name: 'ExampleCo · Senior GenAI Engineer',
  title: 'Software Engineer Intern — Visio AI',
  bullets: [{ kind: 'PROJECT_STACK', text: 'Built a RAG prototype using pgvector in Supabase', want: null }],
  waitingOn: null,
  blockName: 'Visio AI',
  note: 'Adds the RAG prototype.',
  fromVersionId: 'v-visio-base',
  fromVersionName: 'Base',
  improvedBy: null,
  matches: [
    { requirementId: 'r-rag', phrases: ['Built a RAG prototype'], partly: false },
    { requirementId: 'r-lead', phrases: [], partly: true },
  ],
  ...over,
})

const leftOut: LeftOutVersion = { ...view({ versionId: 'v-termo', blockId: 'b-termo', blockName: 'Termo', section: 'PROJECT', stack: 'React, Django' }), why: 'The page is full.', matches: [] }

const analysis: JobAnalysis = {
  requirements: [
    { id: 'r-rag', text: 'RAG pipelines in production', status: 'partial', evidence: 'Only partly.', quotes: [], keys: [] },
    { id: 'r-lead', text: 'Mentoring and team leadership', status: 'covered', evidence: 'Study Rats.', quotes: [], keys: [] },
  ],
  asks: [{ id: 'q1', text: 'Have you built RAG?', requirementId: 'r-rag' }],
  drafts: [draft({}), draft({ key: 'd2', blockId: null, blockName: 'Kubernetes course project', newBlock: { name: 'Kubernetes course project', section: 'PROJECT', org: '', location: '', dates: '', stack: 'Node.js, GKE' }, matches: [] })],
  reused: [view({})],
  leftOut: [leftOut],
  report: [],
}

const library: LibBlock[] = [
  { id: 'b-visio', slug: 'visio', name: 'Visio AI', section: 'EXPERIENCE', org: 'Visio AI', location: 'São Carlos, SP', dates: 'June 2026 – Present', stack: '', position: 0, versions: [] },
]

describe('blockViews', () => {
  test('writes out drafts, blocks used as they are and blocks left out, each with its tag', () => {
    const v = blockViews(newSession(analysis, NOW), library)
    expect(v.drafts.map((d) => [d.blockName, d.tag])).toEqual([
      ['Visio AI', 'new-version'],
      ['Kubernetes course project', 'new-block'],
    ])
    expect(v.drafts[0]).toMatchObject({ dates: 'June 2026 – Present', blockId: 'b-visio', section: 'EXPERIENCE' })
    expect(v.drafts[1]).toMatchObject({ blockId: 'draftblock:d2', section: 'PROJECT', stack: 'Node.js, GKE' })
    expect(v.asIs.map((a) => a.tag)).toEqual(['as-is'])
    expect(v.leftOut.map((a) => [a.blockName, a.tag])).toEqual([['Termo', 'left-out']])
  })

  test('a block you left out with × moves from as is to the left-out list', () => {
    const v = blockViews(toggleAsIsOut(newSession(analysis, NOW), 'v-rats'), library)
    expect(v.asIs).toEqual([])
    expect(v.asIsOut.map((a) => a.blockName)).toEqual(['Study Rats'])
  })

  test('every view has a ref that findView resolves', () => {
    const v = blockViews(newSession(analysis, NOW), library)
    const all = [...v.drafts, ...v.asIs, ...v.leftOut]
    for (const one of all) expect(findView(v, one.ref)).toBe(one)
    expect(findView(v, 'draft:nope')).toBeNull()
  })
})

describe('lookups', () => {
  test('nameLookup names drafts by key and versions by id', () => {
    const name = nameLookup(newSession(analysis, NOW))
    expect(name('d1')).toBe('Visio AI')
    expect(name('v-rats')).toBe('Study Rats')
    expect(name('v-termo')).toBe('Termo')
  })

  test('topicFor uses the requirement the question is about', () => {
    expect(topicFor(newSession(analysis, NOW), 'q1')).toBe('RAG pipelines in production')
  })

  test('the CV block you double-click maps back to its draft or its as-is version', () => {
    const s = newSession(analysis, NOW)
    expect(editTargetForCvBlock(s, 'b-visio')).toEqual({ type: 'draft', key: 'd1' })
    expect(editTargetForCvBlock(s, 'draftblock:d2')).toEqual({ type: 'draft', key: 'd2' })
    expect(editTargetForCvBlock(s, 'b-rats')).toEqual({ type: 'asis', versionId: 'v-rats' })
    expect(editTargetForCvBlock(s, 'b-unknown')).toBeNull()
  })
})

describe('matches', () => {
  test('chip items name each requirement with the block’s own words', () => {
    const v = blockViews(newSession(analysis, NOW), library)
    expect(chipItems(v.drafts[0], analysis.requirements)).toEqual([
      { name: 'RAG pipelines in production', how: 'Built a RAG prototype', partly: false },
      { name: 'Mentoring and team leadership', how: 'Study Rats.', partly: true },
    ])
  })

  test('hitsFor lists the blocks that show a requirement and their words', () => {
    const v = blockViews(newSession(analysis, NOW), library)
    const hits = hitsFor('r-lead', [...v.drafts, ...v.asIs])
    expect(hits.map((h) => [h.view.blockName, h.phrases, h.partly])).toEqual([
      ['Visio AI', [], true],
      ['Study Rats', ['Led a 7-engineer team'], false],
    ])
  })
})

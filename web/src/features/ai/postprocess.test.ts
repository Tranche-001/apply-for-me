import { describe, expect, test } from 'vitest'
import { EXPERIENCE, LIBRARY } from './test-fixtures'
import { cleanBullets, idNames, nameIds, finalizeAnalysis, finalizeBlockDraft, finalizeCvPlan, normalizeSectionOrder, toPostingSummary } from './postprocess'
import type { AnalysisOutput, BlockDraftOutput, CvPlanOutput } from './schemas'

const planOutput = (over: Partial<CvPlanOutput> = {}): CvPlanOutput => ({
  sectionOrder: ['PROJECT'],
  showEducation: true,
  showSkills: true,
  showAchievements: false,
  items: [],
  report: [],
  asks: [],
  ...over,
})

describe('finalizeCvPlan', () => {
  test('keeps known versions, one per block, with its block section and renumbered positions', () => {
    const plan = finalizeCvPlan(
      planOutput({
        items: [
          { versionId: 'v-bi-llm', section: 'EXPERIENCE' },
          { versionId: 'v-bi-base', section: 'PROJECT' },
          { versionId: 'v-visio-base', section: 'EXPERIENCE' },
          { versionId: 'made-up', section: 'PROJECT' },
        ],
        report: [{ tag: 'REUSED', text: '  Fits the role. ' }, { tag: 'NOTE', text: ' ' }],
        asks: ['Did you build RAG?', ' '],
      }),
      LIBRARY,
      1,
    )
    expect(plan.items).toEqual([
      { section: 'PROJECT', position: 0, versionId: 'v-bi-llm' },
      { section: 'EXPERIENCE', position: 0, versionId: 'v-visio-base' },
    ])
    expect(plan.sectionOrder).toEqual(['PROJECT', 'EXPERIENCE'])
    expect(plan.report).toEqual([
      { tag: 'REUSED', text: 'Fits the role.' },
      { tag: 'NOTE', text: 'Skipped 1 version the AI named that is not in your library.' },
    ])
    expect(plan.asks).toEqual([{ id: 'ask-1', text: 'Did you build RAG?' }])
    expect(plan.pages).toBe(1)
  })

  test('two pages always show achievements', () => {
    expect(finalizeCvPlan(planOutput(), LIBRARY, 2).showAchievements).toBe(true)
  })
})

describe('normalizeSectionOrder / cleanBullets', () => {
  test('section order always has both sections once', () => {
    expect(normalizeSectionOrder([])).toEqual(['EXPERIENCE', 'PROJECT'])
    expect(normalizeSectionOrder(['PROJECT', 'PROJECT'])).toEqual(['PROJECT', 'EXPERIENCE'])
  })

  test('bullets: gaps stay empty, empty text is dropped, at most 4', () => {
    const out = cleanBullets([
      { kind: 'MISSING', text: 'invented?', want: 'IMPACT' },
      { kind: 'PROJECT', text: '  ', want: null },
      { kind: 'STACK', text: ' Python ', want: 'IMPACT' },
      { kind: 'IMPACT', text: 'a', want: null },
      { kind: 'IMPACT', text: 'b', want: null },
      { kind: 'IMPACT', text: 'c', want: null },
    ])
    expect(out[0]).toEqual({ kind: 'MISSING', text: '', want: 'IMPACT' })
    expect(out[1]).toEqual({ kind: 'STACK', text: 'Python', want: null })
    expect(out).toHaveLength(4)
  })
})

const analysisOutput = (over: Partial<AnalysisOutput> = {}): AnalysisOutput => ({
  requirements: [],
  asks: [],
  drafts: [],
  reused: [],
  report: [],
  ...over,
})

describe('finalizeAnalysis', () => {
  test('names job versions after the job, new blocks Base, and empties drafts that wait on a question', () => {
    const a = finalizeAnalysis(
      analysisOutput({
        requirements: [{ text: ' Python ', status: 'covered', evidence: 'Visio AI' }, { text: '', status: 'missing', evidence: '' }],
        asks: [
          { id: 'q1', text: 'RAG?', experienceId: 'e-visio' },
          { id: 'q1', text: 'Evals?', experienceId: 'e-made-up' },
          { id: '', text: 'Gemini?', experienceId: null },
        ],
        drafts: [
          { blockId: 'b-visio', newBlock: null, title: 'AI Intern', bullets: [{ kind: 'PROJECT', text: 'Built X.', want: null }], waitingOn: null, note: 'Leads with AI.' },
          { blockId: null, newBlock: { name: 'RAG project', section: 'PROJECT', org: '', location: '', dates: '', stack: '' }, title: 'RAG', bullets: [{ kind: 'PROJECT', text: 'Invented.', want: null }], waitingOn: 'q1', note: 'Waiting.' },
          { blockId: 'nope', newBlock: null, title: 'x', bullets: [], waitingOn: null, note: '' },
        ],
        reused: [{ versionId: 'v-bi-llm', why: 'Made for this job.' }, { versionId: 'v-bi-llm', why: 'dup' }, { versionId: 'ghost', why: '' }],
      }),
      LIBRARY,
      'iFood · GenAI Engineer',
      [{ id: 'e-visio', title: 'Visio AI' }],
    )
    expect(a.requirements).toEqual([{ text: 'Python', status: 'covered', evidence: 'Visio AI' }])
    expect(a.asks.map((q) => q.id)).toEqual(['q1', 'q1-2', 'q3'])
    // An answer goes to the experience the AI named, only when that experience exists.
    expect(a.asks.map((q) => q.experienceId)).toEqual(['e-visio', null, null])
    expect(a.drafts).toHaveLength(2)
    expect(a.drafts[0]).toMatchObject({ key: 'd1', blockId: 'b-visio', blockName: 'Visio AI', name: 'iFood · GenAI Engineer' })
    expect(a.drafts[1]).toMatchObject({ blockId: null, name: 'Base', blockName: 'RAG project', bullets: [], waitingOn: 'q1' })
    expect(a.reused).toEqual([{ versionId: 'v-bi-llm', blockName: 'BI Dashboard', versionName: 'iFood · GenAI Engineer', why: 'Made for this job.' }])
    expect(a.report.map((r) => r.text)).toEqual([
      'Skipped 1 block the AI named that is not in your library.',
      'Skipped 1 version the AI named that is not in your library.',
    ])
  })

  test('toPostingSummary maps statuses to the fixed covered boolean', () => {
    const a = finalizeAnalysis(
      analysisOutput({
        requirements: [
          { text: 'A', status: 'covered', evidence: '' },
          { text: 'B', status: 'partial', evidence: '' },
        ],
      }),
      LIBRARY,
      'Job',
    )
    expect(toPostingSummary(a).requirements).toEqual([
      { text: 'A', covered: true },
      { text: 'B', covered: false },
    ])
  })
})

const blockOutput = (over: Partial<BlockDraftOutput> = {}): BlockDraftOutput => ({
  blockId: null,
  newBlock: null,
  name: '',
  title: ' Intern ',
  bullets: [],
  ...over,
})

describe('finalizeBlockDraft', () => {
  test('a version of a linked block never takes the Base name', () => {
    const d = finalizeBlockDraft(blockOutput({ blockId: 'b-visio', name: 'base' }), LIBRARY, EXPERIENCE)
    expect(d).toMatchObject({ blockId: 'b-visio', newBlock: null, name: 'From your notes', title: 'Intern' })
  })

  test('a block id that is not linked to the experience becomes a new block from the experience fields', () => {
    const d = finalizeBlockDraft(blockOutput({ blockId: 'b-bi' }), LIBRARY, EXPERIENCE)
    expect(d.blockId).toBeNull()
    expect(d.newBlock).toEqual({ name: 'Visio AI', section: 'EXPERIENCE', org: 'Visio AI · São Carlos, SP', location: '', dates: 'June 2026 – Present', stack: '' })
    expect(d.name).toBe('Base')
  })
})

describe('nameIds', () => {
  const names = idNames(
    [{ ...LIBRARY[0], id: 'cmw5pdp510017i5x9xivxd84a', name: 'Study Rats', versions: [{ ...LIBRARY[0].versions[0], id: 'cmw5pdp6a0038i5x9hb84oo30', name: 'LLM pipeline' }] }],
    [{ id: 'cmw5pdpexp0001i5x9abcdefgh', title: 'Visio AI' }],
  )

  test.each([
    // Real lines the model wrote on Job analysis.
    ['BI Dashboard (version cmw5pdp6a0038i5x9hb84oo30) details an LLM pipeline.', 'BI Dashboard (LLM pipeline) details an LLM pipeline.'],
    ['Study Rats (cmw5pdp510017i5x9xivxd84a) demonstrates leading a team.', 'Study Rats demonstrates leading a team.'],
    ['Reused cmw5pdp6a0038i5x9hb84oo30 as it fits.', 'Reused LLM pipeline as it fits.'],
    ['From cmw5pdpexp0001i5x9abcdefgh notes.', 'From Visio AI notes.'],
    ['Unknown (cmw5zzzz0000i5x9zzzzzzzzz) id, gone.', 'Unknown id, gone.'],
    // Ordinary long words are not ids (no digit).
    ['counterrevolutionaries and characteristically', 'counterrevolutionaries and characteristically'],
  ])('%s', (text, expected) => {
    expect(nameIds(text, names)).toBe(expected)
  })
})

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
  leftOut: [],
  report: [],
  ...over,
})

const req = (over: Partial<AnalysisOutput['requirements'][number]> = {}): AnalysisOutput['requirements'][number] => ({
  id: 'r1',
  text: 'Python',
  status: 'covered',
  evidence: 'Visio AI',
  quotes: [],
  keys: [],
  ...over,
})

const draft = (over: Partial<AnalysisOutput['drafts'][number]> = {}): AnalysisOutput['drafts'][number] => ({
  blockId: 'b-visio',
  newBlock: null,
  fromVersionId: null,
  title: 'AI Intern',
  bullets: [{ kind: 'PROJECT', text: 'Built X.', want: null }],
  improvedBy: null,
  matches: [],
  note: 'Leads with AI.',
  ...over,
})

const POSTING = 'We want Python in production and RAG experience.\n\nYou will build   “retrieval” pipelines — end-to-end.'
const run = (raw: AnalysisOutput, posting = POSTING, experiences: { id: string; title: string }[] = []) =>
  finalizeAnalysis(raw, LIBRARY, 'iFood · GenAI Engineer', experiences, posting)

describe('finalizeAnalysis: requirements and quotes (P1)', () => {
  test('keeps a quote only when it occurs in the posting, returning the posting’s own wording', () => {
    const a = run(
      analysisOutput({
        requirements: [
          req({
            quotes: [
              'We want Python in production and RAG experience.',
              'You will build "retrieval" pipelines - end-to-end.', // straight quotes / hyphen for the typographic ones
              'You must have ten years of Rust.', // invented
              '  ',
            ],
          }),
        ],
      }),
    )
    expect(a.requirements[0].quotes).toEqual([
      'We want Python in production and RAG experience.',
      'You will build “retrieval” pipelines — end-to-end.',
    ])
  })

  test('keeps at most 3 quotes and drops duplicates', () => {
    const q = 'We want Python in production and RAG experience.'
    const a = run(analysisOutput({ requirements: [req({ quotes: [q, q, 'Python in production', 'RAG experience', 'build'] })] }))
    expect(a.requirements[0].quotes).toEqual([q, 'Python in production', 'RAG experience'])
  })

  test('a key is kept only when it occurs inside a kept quote', () => {
    const a = run(
      analysisOutput({
        requirements: [
          req({ quotes: ['We want Python in production and RAG experience.', 'Rust forever.'], keys: ['Python in production', 'RAG', 'Rust', 'Kubernetes', ' '] }),
        ],
      }),
    )
    expect(a.requirements[0].keys).toEqual(['Python in production', 'RAG'])
  })

  test('with no posting text every quote and key is dropped, never invented', () => {
    const a = run(analysisOutput({ requirements: [req({ quotes: ['We want Python.'], keys: ['Python'] })] }), '')
    expect(a.requirements[0]).toMatchObject({ quotes: [], keys: [] })
  })

  test('ids: kept, missing ones become r{n}, duplicates get a suffix, empty text drops the requirement', () => {
    const a = run(
      analysisOutput({
        requirements: [req({ id: 'r1' }), req({ id: 'r1', text: 'RAG' }), req({ id: '', text: 'Evals' }), req({ id: 'r9', text: '' })],
      }),
    )
    expect(a.requirements.map((r) => r.id)).toEqual(['r1', 'r1-2', 'r3'])
    expect(a.requirements.map((r) => r.text)).toEqual(['Python', 'RAG', 'Evals'])
  })
})

describe('finalizeAnalysis: asks', () => {
  test('ids stay unique, experienceId and requirementId must exist else null', () => {
    const a = run(
      analysisOutput({
        requirements: [req({ id: 'r1' }), req({ id: 'r2', text: 'RAG' })],
        asks: [
          { id: 'q1', text: 'RAG?', experienceId: 'e-visio', requirementId: 'r2' },
          { id: 'q1', text: 'Evals?', experienceId: 'e-made-up', requirementId: 'r77' },
          { id: '', text: 'Gemini?', experienceId: null, requirementId: null },
        ],
      }),
      POSTING,
      [{ id: 'e-visio', title: 'Visio AI' }],
    )
    expect(a.asks.map((q) => q.id)).toEqual(['q1', 'q1-2', 'q3'])
    expect(a.asks.map((q) => q.experienceId)).toEqual(['e-visio', null, null])
    expect(a.asks.map((q) => q.requirementId)).toEqual(['r2', null, null])
  })
})

describe('finalizeAnalysis: drafts', () => {
  const asks = [{ id: 'q1', text: 'RAG?', experienceId: null, requirementId: 'r1' }]

  test('job versions take the job name, new blocks Base, unknown blocks are skipped and reported', () => {
    const a = run(
      analysisOutput({
        drafts: [
          draft(),
          draft({ blockId: null, newBlock: { name: 'RAG project', section: 'PROJECT', org: '', location: '', dates: '', stack: '' }, title: 'RAG' }),
          draft({ blockId: 'nope', title: 'x' }),
        ],
      }),
    )
    expect(a.drafts).toHaveLength(2)
    expect(a.drafts[0]).toMatchObject({ key: 'd1', blockId: 'b-visio', blockName: 'Visio AI', name: 'iFood · GenAI Engineer', waitingOn: null })
    expect(a.drafts[1]).toMatchObject({ blockId: null, name: 'Base', blockName: 'RAG project', waitingOn: null })
    expect(a.report.map((r) => r.text)).toEqual(['Skipped 1 block the AI named that is not in your library.'])
  })

  test('a MISSING bullet keeps its trimmed hint (200 chars at most); other bullets are unchanged', () => {
    const long = 'x'.repeat(300)
    const a = run(
      analysisOutput({
        asks,
        requirements: [req()],
        drafts: [
          draft({
            improvedBy: 'q1',
            bullets: [
              { kind: 'PROJECT', text: 'Built X.', want: null },
              { kind: 'MISSING', text: '  RAG: your answer to q1 can fill this ', want: 'IMPACT' },
              { kind: 'MISSING', text: long, want: null },
            ],
          }),
        ],
      }),
    )
    const bullets = a.drafts[0].bullets
    expect(bullets[1]).toEqual({ kind: 'MISSING', text: 'RAG: your answer to q1 can fill this', want: 'IMPACT' })
    expect(bullets[2].text).toHaveLength(200)
    expect(a.drafts[0].improvedBy).toBe('q1')
  })

  test('improvedBy must be an ask id, else null', () => {
    const a = run(analysisOutput({ asks, drafts: [draft({ improvedBy: 'q9' }), draft({ improvedBy: 'q1' })] }))
    expect(a.drafts.map((d) => d.improvedBy)).toEqual([null, 'q1'])
  })

  test('fromVersionId must be a version of that draft’s block; its name is filled', () => {
    const a = run(
      analysisOutput({
        drafts: [
          draft({ blockId: 'b-bi', fromVersionId: 'v-bi-llm' }),
          draft({ blockId: 'b-bi', fromVersionId: 'v-visio-base' }), // other block
          draft({ blockId: 'b-bi', fromVersionId: 'ghost' }),
          draft({ blockId: null, newBlock: { name: 'N', section: 'PROJECT', org: '', location: '', dates: '', stack: '' }, fromVersionId: 'v-bi-llm' }),
        ],
      }),
    )
    expect(a.drafts.map((d) => d.fromVersionId)).toEqual(['v-bi-llm', null, null, null])
    expect(a.drafts.map((d) => d.fromVersionName)).toEqual(['iFood · GenAI Engineer', null, null, null])
  })

  test('match phrases must occur in the draft’s bullets and the requirement must exist', () => {
    const a = run(
      analysisOutput({
        requirements: [req({ id: 'r1' })],
        drafts: [
          draft({
            matches: [
              { requirementId: 'r1', phrases: ['Built X', 'Built Y', ''], partly: false },
              { requirementId: 'r5', phrases: ['Built X'], partly: false }, // unknown requirement
              { requirementId: 'r1', phrases: ['nothing here'], partly: true }, // no phrase survives
            ],
          }),
        ],
      }),
    )
    expect(a.drafts[0].matches).toEqual([{ requirementId: 'r1', phrases: ['Built X'], partly: false }])
  })
})

describe('finalizeAnalysis: reused and left out', () => {
  test('are written out in full from the library, with their matches checked against the real bullets', () => {
    const a = run(
      analysisOutput({
        requirements: [req({ id: 'r1' })],
        reused: [
          { versionId: 'v-bi-llm', why: 'Made for this job.', matches: [{ requirementId: 'r1', phrases: ['lead-analysis time', 'invented'], partly: true }] },
          { versionId: 'v-bi-llm', why: 'dup', matches: [] },
          { versionId: 'ghost', why: '', matches: [] },
        ],
        leftOut: [{ versionId: 'v-visio-base', why: 'Not about AI.', matches: [{ requirementId: 'r1', phrases: ['reconciliation platform'], partly: false }] }],
      }),
    )
    expect(a.reused).toEqual([
      {
        versionId: 'v-bi-llm',
        blockId: 'b-bi',
        blockName: 'BI Dashboard',
        versionName: 'iFood · GenAI Engineer',
        section: 'PROJECT',
        title: 'LLM-Powered CRM Insights Pipeline',
        org: '',
        location: '',
        dates: '',
        stack: 'n8n, Python, Gemini',
        bullets: [{ kind: 'IMPACT', text: 'Cut lead-analysis time from 10 hours to minutes.', want: null }],
        why: 'Made for this job.',
        matches: [{ requirementId: 'r1', phrases: ['lead-analysis time'], partly: true }],
      },
    ])
    expect(a.leftOut).toHaveLength(1)
    expect(a.leftOut[0]).toMatchObject({ versionId: 'v-visio-base', blockName: 'Visio AI', why: 'Not about AI.', title: 'Software Engineer Intern' })
    expect(a.leftOut[0].bullets).toHaveLength(2)
    expect(a.leftOut[0].matches).toEqual([{ requirementId: 'r1', phrases: ['reconciliation platform'], partly: false }])
    expect(a.report.map((r) => r.text)).toEqual(['Skipped 1 version the AI named that is not in your library.'])
  })

  test('a version cannot be both reused and left out: reused wins', () => {
    const a = run(
      analysisOutput({
        reused: [{ versionId: 'v-bi-llm', why: 'fits', matches: [] }],
        leftOut: [
          { versionId: 'v-bi-llm', why: 'also out?', matches: [] },
          { versionId: 'v-bi-base', why: 'Empty.', matches: [] },
          { versionId: 'v-bi-base', why: 'dup', matches: [] },
        ],
      }),
    )
    expect(a.reused.map((r) => r.versionId)).toEqual(['v-bi-llm'])
    expect(a.leftOut.map((r) => r.versionId)).toEqual(['v-bi-base'])
  })
})

describe('finalizeAnalysis: other', () => {
  test('toPostingSummary maps statuses to the fixed covered boolean', () => {
    const a = run(analysisOutput({ requirements: [req({ id: 'r1', text: 'A' }), req({ id: 'r2', text: 'B', status: 'partial' })] }))
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

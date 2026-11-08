import { describe, expect, it } from 'vitest'
import type { CvReviewOutput } from '../ai/schemas'
import type { JobAnalysis, LeftOutVersion, ReusedVersion } from '../ai/types'
import type { LibBlock } from '../blocks/types'
import { afterSession, keepAfter, keepBefore, reviewAfter, withReview } from './cv-review'
import { reviewInput, reviewRows } from './cv-draft'
import { parseSession } from './session'
import type { AnalysisSession, SessionDraft } from './types'

// The iFood check: Visio and Study Rats (experience), Termo and BI (projects) on the CV; IAAS! left out; Vira Voto in
// the library but not named by the analysis.
const block = (id: string, section: 'EXPERIENCE' | 'PROJECT', position: number, title = `${id} title`): LibBlock => ({
  id,
  slug: id,
  name: id,
  section,
  org: '',
  location: '',
  dates: '2026',
  stack: '',
  position,
  versions: [
    { id: `${id}-v`, blockId: id, name: 'Base', title, isBase: true, themes: [], position: 0, bullets: [{ kind: 'PROJECT', text: `Built ${id}`, want: null }], jobIds: [] },
    { id: `${id}-v2`, blockId: id, name: 'Other', title, isBase: false, themes: [], position: 1, bullets: [{ kind: 'PROJECT', text: `Led ${id}`, want: null }], jobIds: [] },
  ],
})

const library = [
  block('visio', 'EXPERIENCE', 0, 'Software Engineer Intern — Visio AI'),
  block('sr', 'EXPERIENCE', 1, 'Tech Lead — Study Rats'),
  block('iaas', 'EXPERIENCE', 2, 'Full-Stack Engineer Intern — IAAS!'),
  block('bi', 'PROJECT', 3),
  block('termo', 'PROJECT', 4),
  block('vv', 'PROJECT', 5),
]

const view = (id: string, section: 'EXPERIENCE' | 'PROJECT') => ({
  versionId: `${id}-v`,
  blockId: id,
  blockName: id,
  versionName: 'Base',
  section,
  title: `${id} title`,
  org: '',
  location: '',
  dates: '2026',
  stack: '',
  bullets: [{ kind: 'PROJECT' as const, text: `Built ${id}`, want: null }],
  why: '',
  matches: [],
})

const reused: ReusedVersion[] = [view('visio', 'EXPERIENCE'), view('termo', 'PROJECT'), view('bi', 'PROJECT')]
const leftOut: LeftOutVersion[] = [view('iaas', 'EXPERIENCE')]

const draft: SessionDraft = {
  key: 'd1',
  blockId: 'sr',
  newBlock: null,
  blockName: 'sr',
  name: 'iFood · AI Builder',
  title: 'Tech Lead — Study Rats',
  bullets: [{ kind: 'PROJECT', text: 'Built a study app with Next.js', want: null }],
  waitingOn: null,
  note: '',
  fromVersionId: 'sr-v',
  fromVersionName: 'Base',
  improvedBy: null,
  matches: [{ requirementId: 'r1', phrases: ['Next.js'], partly: false }],
  keep: true,
  editedByHand: false,
  saveAs: 'new',
}

const analysis: JobAnalysis = { requirements: [], asks: [], drafts: [], reused, leftOut, report: [], order: ['termo', 'visio', 'sr', 'bi'] }
const session: AnalysisSession = {
  v: 2,
  analysis,
  answers: {},
  dont: {},
  sent: {},
  drafts: [draft],
  asIsOut: [],
  pages: 1,
  step: 'review',
  analyzedAt: '2026-11-08T10:00:00.000Z',
  savedAt: null,
}

const raw = (patch: Partial<CvReviewOutput>): CvReviewOutput => ({ order: [], remove: [], add: [], sections: [], oneSection: false, roleTitles: [], drafts: [], report: [], ...patch })
const ctx = { library, jobRole: 'AI Builder', request: 'Put company experience first.' }
const keysOf = (s: AnalysisSession) => reviewRows(reviewInput(library, s)).rows.map((r) => `${r.key}:${r.versionId}`)
const make = (patch: Partial<CvReviewOutput>, s = session) => withReview(s, { request: ctx.request, remember: true, madeAt: 'now', ...reviewAfter(s, raw(patch), ctx) })

describe('reviewAfter: the After CV from the AI’s answer', () => {
  it('follows the AI’s order, by key, block id or block name; blocks it forgets follow', () => {
    const s = afterSession(make({ order: ['visio', 'Study Rats', 'sr', 'bi'] }))
    expect(keysOf(s)).toEqual(['visio:visio-v', 'sr:draft:d1', 'bi:bi-v', 'termo:termo-v'])
  })

  it('swaps a block for a left-out version, and adds a library version the analysis never named', () => {
    const s = afterSession(make({ remove: ['termo'], add: [{ versionId: 'iaas-v', why: 'Asked for' }, { versionId: 'vv-v', why: 'Near the top' }], order: ['visio', 'iaas', 'sr', 'vv', 'bi'] }))
    expect(keysOf(s)).toEqual(['visio:visio-v', 'iaas:iaas-v', 'sr:draft:d1', 'vv:vv-v', 'bi:bi-v'])
    expect(s.analysis.leftOut.map((v) => v.versionId)).toEqual(['iaas-v', 'vv-v'])
    expect(s.arrangement?.swappedOut).toEqual(['termo'])
  })

  it('another version of a block on the CV takes its place', () => {
    const s = afterSession(make({ add: [{ versionId: 'bi-v2', why: '' }] }))
    expect(keysOf(s)).toContain('bi:bi-v2')
    expect(keysOf(s)).not.toContain('bi:bi-v')
  })

  it('drops unknown ids and says so; a draft version or a version already shown is not added again', () => {
    const r = reviewAfter(session, raw({ add: [{ versionId: 'nope', why: '' }, { versionId: 'visio-v', why: '' }], remove: ['ghost'], order: ['ghost'] }), ctx)
    expect(r.after.leftOut).toEqual(leftOut)
    expect(r.report.some((l) => /not in your library/.test(l.text))).toBe(true)
  })

  it('sections and one section come from the AI; a block back in its own section is not a move', () => {
    const s = afterSession(make({ sections: [{ block: 'termo', section: 'EXPERIENCE' }, { block: 'visio', section: 'EXPERIENCE' }], oneSection: true }))
    expect(s.arrangement?.sections).toEqual({ termo: 'EXPERIENCE' })
    expect(s.arrangement?.oneSection).toBe(true)
  })

  it('a role title he asked for is picked, role only; a seniority word only when he or the job used it', () => {
    const r = reviewAfter(session, raw({ roleTitles: [{ block: 'visio', title: 'AI Builder — Visio AI' }, { block: 'sr', title: 'Senior AI Builder' }, { block: 'bi', title: 'AI Builder' }] }), ctx)
    expect(r.after.roleTitles).toEqual([{ block: 'visio', title: 'AI Builder' }])
    expect(r.after.titles).toEqual({ visio: { pick: 'ai', own: '' } })
    const asked = reviewAfter(session, raw({ roleTitles: [{ block: 'sr', title: 'Senior AI Builder' }] }), { ...ctx, request: 'Use Senior AI Builder at Study Rats' })
    expect(asked.after.roleTitles).toEqual([{ block: 'sr', title: 'Senior AI Builder' }])
  })

  it('new wording only for a kept draft not edited by hand; matches keep only words still there', () => {
    const r = reviewAfter(session, raw({ drafts: [{ block: 'sr', title: 'ignored', bullets: [{ kind: 'PROJECT', text: 'Led a study app', want: null }], note: 'Shorter.' }] }), ctx)
    expect(r.after.drafts[0]).toMatchObject({ title: 'Tech Lead — Study Rats', bullets: [{ kind: 'PROJECT', text: 'Led a study app', want: null }], note: 'Shorter.', matches: [] })
    const edited = { ...session, drafts: [{ ...draft, editedByHand: true }] }
    expect(reviewAfter(edited, raw({ drafts: [{ block: 'sr', title: '', bullets: [{ kind: 'PROJECT', text: 'X', want: null }], note: '' }] }), ctx).after.drafts).toEqual(edited.drafts)
  })
})

describe('Before / After in the session', () => {
  const reviewing = make({ remove: ['termo'], order: ['visio', 'sr', 'bi'], roleTitles: [{ block: 'visio', title: 'AI Builder' }] })

  it('the session stays the Before CV while you compare; it still parses (old sessions too)', () => {
    expect(keysOf(reviewing)).toEqual(keysOf(session))
    expect(parseSession(reviewing)).not.toBeNull()
    expect(parseSession(session)).not.toBeNull()
  })

  it('Keep After applies the After CV and closes REVIEW; Keep Before only closes it', () => {
    const after = keepAfter(reviewing)
    expect(after.review).toBeUndefined()
    expect(keysOf(after)).toEqual(['visio:visio-v', 'sr:draft:d1', 'bi:bi-v'])
    expect(after.titles).toEqual({ visio: { pick: 'ai', own: '' } })
    const before = keepBefore(reviewing)
    expect(before).toEqual(session)
  })

  it('with no review open, keeping changes nothing', () => {
    expect(keepAfter(session)).toEqual(session)
    expect(afterSession(session)).toEqual(session)
  })
})

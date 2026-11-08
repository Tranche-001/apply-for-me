import { describe, expect, it } from 'vitest'
import type { JobAnalysis, LeftOutVersion, ReusedVersion } from '../../ai/types'
import type { LibBlock } from '../../blocks/types'
import { swapChoices } from '../arrangement'
import { reviewRows, type ReviewInput } from '../cv-draft'
import type { AnalysisSession, Arrangement } from '../types'
import { reviewOrderActions } from './review-order-actions'
import { orderGroups, orderStatus, rowLine, swapItems } from './review-order-view'
import { blockViews } from './view-model'

const block = (id: string, section: 'EXPERIENCE' | 'PROJECT', position: number): LibBlock => ({
  id,
  slug: id,
  name: id,
  section,
  org: '',
  location: '',
  dates: '2026',
  stack: '',
  position,
  versions: [{ id: `${id}-v`, blockId: id, name: 'Base', title: id, isBase: true, themes: [], position: 0, bullets: [], jobIds: [] }],
})
const library = [block('visio', 'EXPERIENCE', 0), block('sr', 'EXPERIENCE', 1), block('afm', 'PROJECT', 2), block('termo', 'PROJECT', 3), block('iaas', 'PROJECT', 4)]

const version = (id: string, section: 'EXPERIENCE' | 'PROJECT', names: string, reqs: string[]) => ({
  versionId: `${id}-v`,
  blockId: id,
  blockName: names,
  versionName: 'Base',
  section,
  title: id,
  org: '',
  location: '',
  dates: section === 'EXPERIENCE' ? 'June 2026 – Present' : '2026',
  stack: '',
  bullets: [],
  why: '',
  matches: reqs.map((r) => ({ requirementId: r, phrases: [], partly: false })),
})
const reused: ReusedVersion[] = [version('visio', 'EXPERIENCE', 'Visio AI', ['r1', 'r2']), version('afm', 'PROJECT', 'Apply For Me', ['r1']), version('sr', 'EXPERIENCE', 'Study Rats', []), version('termo', 'PROJECT', 'Termo', [])]
const leftOut: LeftOutVersion[] = [version('iaas', 'PROJECT', 'IAAS!', ['r1', 'r2'])]
const requirements = ['r1', 'r2'].map((id) => ({ id, text: id, status: 'covered' as const, evidence: '', quotes: [], keys: [] }))
const analysis: JobAnalysis = { requirements, asks: [], drafts: [], reused, leftOut, report: [], order: ['visio', 'afm', 'sr', 'termo'] }

const session = (arrangement?: Arrangement): AnalysisSession => ({
  v: 2,
  analysis,
  answers: {},
  dont: {},
  sent: {},
  drafts: [],
  asIsOut: [],
  pages: 1,
  step: 'review',
  analyzedAt: '2026-11-08T10:00:00.000Z',
  savedAt: null,
  ...(arrangement ? { arrangement } : {}),
})
const inputOf = (s: AnalysisSession): ReviewInput => ({ library, drafts: s.drafts, reused: s.analysis.reused, asIsOut: s.asIsOut, pages: s.pages, order: s.analysis.order, leftOut: s.analysis.leftOut, arrangement: s.arrangement })
const keys = (s: AnalysisSession) => reviewRows(inputOf(s)).rows.map((r) => r.key)

/** The actions on a session held here, the way use-analysis's `change` holds it. */
function harness(start: AnalysisSession) {
  let s = start
  const actions = reviewOrderActions((fn) => {
    s = fn(s)
  }, inputOf)
  return { actions, get: () => s }
}

describe('the card’s rows', () => {
  const s = session()
  const views = blockViews(s, library)

  it('two sections: Experience then Projects, numbered lines with kind, dates and requirements', () => {
    const groups = orderGroups({ rows: reviewRows(inputOf(s)).rows, views, requirements, oneSection: false })
    expect(groups.map((g) => [g.heading, g.rows.map((r) => r.name)])).toEqual([
      ['Experience', ['Visio AI', 'Study Rats']],
      ['Projects', ['Apply For Me', 'Termo']],
    ])
    expect(groups[0].rows[0]).toMatchObject({ sub: 'Experience · June 2026 – Present · 2 requirements', moveTo: 'PROJECT', swappedIn: false })
    expect(groups[1].rows[1]).toMatchObject({ sub: 'Project · 2026 · No requirement', moveTo: 'EXPERIENCE' })
  })

  it('one section: one list in your order, no Move to', () => {
    const one = session({ oneSection: true })
    const [all] = orderGroups({ rows: reviewRows(inputOf(one)).rows, views, requirements, oneSection: true })
    expect(all.heading).toBeNull()
    expect(all.rows.map((r) => [r.name, r.moveTo])).toEqual([
      ['Visio AI', null],
      ['Apply For Me', null],
      ['Study Rats', null],
      ['Termo', null],
    ])
  })

  it('a block moved says where it is on this CV', () => {
    expect(rowLine({ home: 'PROJECT', section: 'EXPERIENCE' }, { dates: '2026', matches: [] }, requirements, false)).toBe('Project, in Experience · 2026 · No requirement')
  })

  it('the Swap menu names each block left out and what it would match', () => {
    const { rows, out } = reviewRows(inputOf(s))
    expect(swapItems(swapChoices({ rows, out, leftOut }), out, views, requirements)).toEqual([{ key: 'iaas', name: 'IAAS!', sub: 'Project · left out · would match 2 requirements' }])
  })

  it('the status says whose order it is', () => {
    expect(orderStatus(session())).toBe('Order suggested by the AI')
    expect(orderStatus(session({ oneSection: true }))).toBe('Order suggested by the AI')
    expect(orderStatus(session({ order: ['afm'] }))).toBe('Your order')
    expect(orderStatus({ ...session(), analysis: { ...analysis, order: undefined } })).toBe('Library order')
  })
})

describe('reviewOrderActions', () => {
  it('↓ and ↑ use the composition’s moveBy, inside the section', () => {
    const h = harness(session())
    h.actions.moveBy('visio', 1)
    expect(keys(h.get())).toEqual(['sr', 'afm', 'visio', 'termo'])
    h.actions.moveBy('visio', 1) // already last of Experience: nothing changes
    expect(h.get().arrangement?.order).toEqual(['sr', 'afm', 'visio', 'termo'])
  })

  it('a drag uses moveTo; a drop on the other section is ignored', () => {
    const h = harness(session())
    h.actions.moveTo('termo', 'afm')
    expect(keys(h.get())).toEqual(['visio', 'termo', 'sr', 'afm'])
    const before = h.get()
    h.actions.moveTo('termo', 'visio')
    expect(h.get()).toBe(before)
  })

  it('with one section a drag crosses experiences and projects', () => {
    const h = harness(session({ oneSection: true }))
    h.actions.moveTo('termo', 'visio')
    expect(keys(h.get())).toEqual(['termo', 'visio', 'afm', 'sr'])
  })

  it('swap, move to Experience, one section and reset', () => {
    const h = harness(session())
    h.actions.swap('termo', 'iaas')
    expect(keys(h.get())).toEqual(['visio', 'afm', 'sr', 'iaas'])
    h.actions.toSection('afm', 'EXPERIENCE')
    expect(h.get().arrangement?.sections).toEqual({ afm: 'EXPERIENCE' })
    h.actions.setOneSection(true)
    h.actions.reset()
    expect(h.get().arrangement).toEqual({ oneSection: true })
    expect(keys(h.get())).toEqual(['visio', 'afm', 'sr', 'termo'])
  })
})

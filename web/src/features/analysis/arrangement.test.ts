import { describe, expect, it } from 'vitest'
import type { JobAnalysis, LeftOutVersion, ReusedVersion } from '../ai/types'
import type { LibBlock } from '../blocks/types'
import { moveBy, moveTo } from '../cv/composition'
import { arrangementChanged, moveToSection, reslot, resetArrangement, setOneSection, setOrder, swapBlock, swapChoices } from './arrangement'
import { cvRequirements } from './coverage'
import { compositionForReview, reviewRows, savedItemsFor } from './cv-draft'
import type { AnalysisSession, Arrangement } from './types'

// The prototype's CV (next-ideas.html #order): Visio, Apply For Me, Vira Voto, Study Rats, BI, Termo; IAAS! and
// Attendance left out.
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
  versions: [{ id: `${id}-v`, blockId: id, name: 'Base', title: id, isBase: true, themes: [], position: 0, bullets: [{ kind: 'PROJECT', text: 'did', want: null }], jobIds: [] }],
})

const library = [
  block('visio', 'EXPERIENCE', 0),
  block('sr', 'EXPERIENCE', 1),
  block('att', 'EXPERIENCE', 2),
  block('afm', 'PROJECT', 3),
  block('vv', 'PROJECT', 4),
  block('bi', 'PROJECT', 5),
  block('termo', 'PROJECT', 6),
  block('iaas', 'PROJECT', 7),
]

const view = (id: string, section: 'EXPERIENCE' | 'PROJECT', reqs: string[] = []) => ({
  versionId: `${id}-v`,
  blockId: id,
  blockName: id,
  versionName: 'Base',
  section,
  title: id,
  org: '',
  location: '',
  dates: '2026',
  stack: '',
  bullets: [],
  why: '',
  matches: reqs.map((r) => ({ requirementId: r, phrases: [], partly: false })),
})

const reused: ReusedVersion[] = [view('visio', 'EXPERIENCE', ['r1']), view('afm', 'PROJECT'), view('vv', 'PROJECT'), view('sr', 'EXPERIENCE'), view('bi', 'PROJECT'), view('termo', 'PROJECT', ['r3'])]
const leftOut: LeftOutVersion[] = [view('iaas', 'PROJECT', ['r2']), view('att', 'EXPERIENCE')]
const AI_ORDER = ['visio', 'afm', 'vv', 'sr', 'bi', 'termo']

const analysis: JobAnalysis = { requirements: [], asks: [], drafts: [], reused, leftOut, report: [], order: AI_ORDER }
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

const input = (s: AnalysisSession) => ({ library, drafts: s.drafts, reused: s.analysis.reused, asIsOut: s.asIsOut, pages: s.pages, order: s.analysis.order, leftOut: s.analysis.leftOut, arrangement: s.arrangement })
const keys = (s: AnalysisSession) => reviewRows(input(s)).rows.map((r) => r.key)
const comp = (s: AnalysisSession) => compositionForReview(input(s))
const ids = (s: AnalysisSession, section: 'EXPERIENCE' | 'PROJECT' = 'EXPERIENCE') => comp(s).items[section].map((r) => r.blockId)

describe('reviewRows and the review CV', () => {
  it('without an arrangement: the AI’s order, two sections, each block in its own section', () => {
    const s = session()
    expect(keys(s)).toEqual(AI_ORDER)
    expect(ids(s)).toEqual(['visio', 'sr'])
    expect(ids(s, 'PROJECT')).toEqual(['afm', 'vv', 'bi', 'termo'])
    expect(comp(s).oneSection ?? false).toBe(false)
  })

  it('your order wins over the AI’s; blocks it does not name follow', () => {
    const s = session({ order: ['termo', 'sr', 'visio'] })
    expect(keys(s)).toEqual(['termo', 'sr', 'visio', 'afm', 'vv', 'bi'])
    expect(ids(s)).toEqual(['sr', 'visio'])
    expect(ids(s, 'PROJECT')).toEqual(['termo', 'afm', 'vv', 'bi'])
  })

  it('one section: every block in one list, in your order', () => {
    const c = comp(session({ oneSection: true }))
    expect(c.oneSection).toBe(true)
    expect(c.items.EXPERIENCE.map((r) => r.blockId)).toEqual(AI_ORDER)
    expect(c.items.PROJECT).toEqual([])
  })

  it('a block moved to Experience sits there on this CV; its own section is kept', () => {
    const { rows } = reviewRows(input(session({ sections: { afm: 'EXPERIENCE' } })))
    expect(rows.find((r) => r.key === 'afm')).toMatchObject({ section: 'EXPERIENCE', home: 'PROJECT' })
    expect(ids(session({ sections: { afm: 'EXPERIENCE' } }))).toEqual(['visio', 'afm', 'sr'])
  })

  it('a swapped-in left-out version is a row; a swapped-out block is not, and is listed as out', () => {
    const s = session({ swappedIn: ['iaas-v'], swappedOut: ['termo'], order: ['visio', 'afm', 'vv', 'sr', 'bi', 'iaas'] })
    const { rows, out } = reviewRows(input(s))
    expect(rows.map((r) => r.key)).toEqual(['visio', 'afm', 'vv', 'sr', 'bi', 'iaas'])
    expect(rows.find((r) => r.key === 'iaas')).toMatchObject({ versionId: 'iaas-v', swappedIn: true })
    expect(out.map((r) => r.key)).toEqual(['termo'])
  })

  it('a swapped-in version whose block is gone, or already on the CV, is ignored', () => {
    const s = session({ swappedIn: ['nope-v', 'visio-v'] })
    expect(keys(s)).toEqual(AI_ORDER)
  })

  it('Save stores the arranged CV (one section: one list, in your order)', () => {
    const s = session({ oneSection: true, order: ['afm', 'visio'], swappedIn: ['iaas-v'], swappedOut: ['termo'] })
    expect(savedItemsFor(comp(s), {}).map((i) => i.versionId)).toEqual(['afm-v', 'visio-v', 'sr-v', 'vv-v', 'bi-v', 'iaas-v'])
  })
})

describe('reslot', () => {
  it('puts a section’s new order back in the places that section held in the whole list', () => {
    expect(reslot(AI_ORDER, ['vv', 'afm', 'bi', 'termo'])).toEqual(['visio', 'vv', 'afm', 'sr', 'bi', 'termo'])
    expect(reslot(AI_ORDER, ['sr', 'visio'])).toEqual(['sr', 'afm', 'vv', 'visio', 'bi', 'termo'])
  })

  it('one section: the new order is the whole list', () => {
    expect(reslot(AI_ORDER, ['afm', 'visio', 'vv', 'sr', 'bi', 'termo'])).toEqual(['afm', 'visio', 'vv', 'sr', 'bi', 'termo'])
  })
})

describe('moving with the composition moves (drag and ↑/↓)', () => {
  it('↓ on Visio in one section: Apply For Me goes first, and the order is kept in the session', () => {
    const s = session({ oneSection: true })
    const moved = moveBy(comp(s), 'visio', 1).items.EXPERIENCE.map((r) => r.blockId)
    const next = setOrder(s, reslot(keys(s), moved))
    expect(next.arrangement).toEqual({ oneSection: true, order: ['afm', 'visio', 'vv', 'sr', 'bi', 'termo'] })
    expect(keys(next)).toEqual(['afm', 'visio', 'vv', 'sr', 'bi', 'termo'])
  })

  it('dragging Termo onto Apply For Me in two sections keeps the experiences where they were', () => {
    const s = session()
    const moved = moveTo(comp(s), 'termo', 'afm').items.PROJECT.map((r) => r.blockId)
    expect(keys(setOrder(s, reslot(keys(s), moved)))).toEqual(['visio', 'termo', 'afm', 'sr', 'vv', 'bi'])
  })

  it('the session is never changed in place', () => {
    const s = session()
    const before = JSON.stringify(s)
    setOrder(s, ['bi'])
    moveToSection(s, { key: 'afm', home: 'PROJECT' }, 'EXPERIENCE')
    setOneSection(s, true)
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('Move to Experience / Move to Projects', () => {
  it('moves the block on this CV only, and back to its own section clears the move', () => {
    const moved = moveToSection(session(), { key: 'afm', home: 'PROJECT' }, 'EXPERIENCE')
    expect(moved.arrangement?.sections).toEqual({ afm: 'EXPERIENCE' })
    expect(ids(moved)).toEqual(['visio', 'afm', 'sr'])
    const back = moveToSection(moved, { key: 'afm', home: 'PROJECT' }, 'PROJECT')
    expect(back.arrangement?.sections).toEqual({})
  })
})

describe('Swap', () => {
  const rowOf = (s: AnalysisSession, key: string) => reviewRows(input(s)).rows.find((r) => r.key === key)!

  const choices = (s: AnalysisSession, key: string, lists: { leftOut?: LeftOutVersion[] } = {}) => {
    const { rows, out } = reviewRows(input(s))
    return swapChoices({ rows, out, leftOut: lists.leftOut ?? s.analysis.leftOut, reused: s.analysis.reused, asIsOut: s.asIsOut, arrangement: s.arrangement }, rowOf(s, key))
  }
  const iaasChoice = { id: 'iaas-v', key: 'iaas', versionId: 'iaas-v', home: 'PROJECT' as const }

  it('the menu offers the blocks left out whose block is not on the CV', () => {
    expect(choices(session(), 'termo').map((c) => c.key)).toEqual(['iaas', 'att'])
  })

  it('Termo → IAAS!: IAAS! takes Termo’s place, Termo goes to Left out', () => {
    const s = session()
    const iaas = choices(s, 'termo').find((c) => c.key === 'iaas')!
    const next = swapBlock(s, rowOf(s, 'termo'), iaas, keys(s))
    expect(keys(next)).toEqual(['visio', 'afm', 'vv', 'sr', 'bi', 'iaas'])
    expect(next.arrangement).toMatchObject({ swappedIn: ['iaas-v'], swappedOut: ['termo'] })
    const after = reviewRows(input(next))
    expect(after.out.map((r) => r.key)).toEqual(['termo'])
    // Termo can come back the same way, in IAAS!’s place.
    expect(choices(next, 'iaas').map((c) => [c.key, c.versionId])).toEqual([['termo', null], ['att', 'att-v']])
  })

  it('swapping back undoes the swap (IAAS! returns to Left out, Termo to its place)', () => {
    const s = session()
    const first = swapBlock(s, rowOf(s, 'termo'), iaasChoice, keys(s))
    const back = choices(first, 'iaas').find((c) => c.key === 'termo')!
    const again = swapBlock(first, rowOf(first, 'iaas'), back, keys(first))
    expect(keys(again)).toEqual(AI_ORDER)
    expect(again.arrangement).toMatchObject({ swappedIn: [], swappedOut: [] })
  })

  // What the iFood check showed: every library block is on the CV, and the AI's left-out versions are other
  // versions of those blocks. A row can take another version of its own block.
  describe('another version of the same block', () => {
    const alt = { ...view('termo', 'PROJECT', ['r2']), versionId: 'termo-alt', versionName: 'Web Full-Stack' }
    const s = { ...session(), analysis: { ...analysis, leftOut: [...leftOut, alt] } }

    it('is offered only on that block’s row', () => {
      expect(choices(s, 'termo').map((c) => c.id)).toEqual(['iaas-v', 'att-v', 'termo-alt'])
      expect(choices(s, 'bi').map((c) => c.id)).toEqual(['iaas-v', 'att-v'])
    })

    it('takes the row’s place; the version it replaces is offered back, and comes back', () => {
      const pick = choices(s, 'termo').find((c) => c.id === 'termo-alt')!
      const next = swapBlock(s, rowOf(s, 'termo'), pick, keys(s))
      expect(keys(next)).toEqual(AI_ORDER)
      expect(rowOf(next, 'termo')).toMatchObject({ versionId: 'termo-alt', swappedIn: true })
      expect(reviewRows(input(next)).out.map((r) => r.versionId)).toEqual(['termo-v'])
      const back = choices(next, 'termo').find((c) => c.versionId === null)!
      expect(back).toMatchObject({ key: 'termo' })
      const again = swapBlock(next, rowOf(next, 'termo'), back, keys(next))
      expect(rowOf(again, 'termo')).toMatchObject({ versionId: 'termo-v', swappedIn: false })
      expect(again.arrangement).toMatchObject({ swappedIn: [], swappedOut: [] })
    })

    it('one swapped-in version can be swapped for another of the same block', () => {
      const other = { ...alt, versionId: 'termo-alt2' }
      const s2 = { ...s, analysis: { ...s.analysis, leftOut: [...s.analysis.leftOut, other] } }
      const first = swapBlock(s2, rowOf(s2, 'termo'), choices(s2, 'termo').find((c) => c.id === 'termo-alt')!, keys(s2))
      const second = swapBlock(first, rowOf(first, 'termo'), choices(first, 'termo').find((c) => c.id === 'termo-alt2')!, keys(first))
      expect(rowOf(second, 'termo')).toMatchObject({ versionId: 'termo-alt2', swappedIn: true })
      expect(second.arrangement).toMatchObject({ swappedIn: ['termo-alt2'], swappedOut: ['termo'] })
    })
  })

  it('a version you took out with × is offered too; Back to the AI’s order leaves it out again', () => {
    const s = { ...session(), asIsOut: ['termo-v'] }
    expect(keys(s)).toEqual(['visio', 'afm', 'vv', 'sr', 'bi'])
    const pick = choices(s, 'bi').find((c) => c.key === 'termo')!
    expect(pick).toMatchObject({ versionId: 'termo-v' })
    const next = swapBlock(s, rowOf(s, 'bi'), pick, keys(s))
    expect(keys(next)).toEqual(['visio', 'afm', 'vv', 'sr', 'termo'])
    expect(next.asIsOut).toEqual(['termo-v'])
    expect(keys(resetArrangement(next))).toEqual(['visio', 'afm', 'vv', 'sr', 'bi'])
  })

  it('“This CV” is recalculated: IAAS! brings r2 with it, and r3 (only Termo showed it) is no longer met', () => {
    const requirements = ['r1', 'r2', 'r3'].map((id) => ({ id, text: id, status: 'covered' as const, evidence: '', quotes: [], keys: [] }))
    const versions = [...reused, ...leftOut]
    const coverage = (s: AnalysisSession) => {
      const kept = reviewRows(input(s)).rows.map((r) => ({ id: r.versionId, blockName: r.key, matches: versions.find((v) => v.versionId === r.versionId)!.matches }))
      const { met, notMet } = cvRequirements({ requirements }, kept)
      return { met: met.map((m) => m.requirement.id), notMet: notMet.map((r) => r.id) }
    }
    const s = session()
    expect(coverage(s)).toEqual({ met: ['r1', 'r3'], notMet: ['r2'] })
    const next = swapBlock(s, rowOf(s, 'termo'), iaasChoice, keys(s))
    expect(coverage(next)).toEqual({ met: ['r1', 'r2'], notMet: ['r3'] })
  })

  it('an experience swapped into a project’s place sits in Projects on this CV', () => {
    const s = session()
    const next = swapBlock(s, rowOf(s, 'termo'), { id: 'att-v', key: 'att', versionId: 'att-v', home: 'EXPERIENCE' }, keys(s))
    expect(next.arrangement?.sections).toEqual({ att: 'PROJECT' })
    expect(ids(next, 'PROJECT')).toEqual(['afm', 'vv', 'bi', 'att'])
  })
})

describe('changed and reset', () => {
  it('nothing arranged, or only the section layout, is the AI’s order', () => {
    expect(arrangementChanged(undefined)).toBe(false)
    expect(arrangementChanged({ oneSection: true })).toBe(false)
    expect(arrangementChanged({ sections: {} , swappedIn: [], swappedOut: [] })).toBe(false)
    expect(arrangementChanged({ order: AI_ORDER })).toBe(true)
    expect(arrangementChanged({ swappedOut: ['termo'] })).toBe(true)
    expect(arrangementChanged({ sections: { afm: 'EXPERIENCE' } })).toBe(true)
  })

  it('“Back to the AI’s order” undoes order, swaps and moves, and keeps One section', () => {
    const s = session({ order: ['bi'], swappedIn: ['iaas-v'], swappedOut: ['termo'], sections: { afm: 'EXPERIENCE' }, oneSection: true })
    expect(resetArrangement(s).arrangement).toEqual({ oneSection: true })
    expect(keys(resetArrangement(s))).toEqual(AI_ORDER)
    expect(resetArrangement(session({ order: ['bi'] })).arrangement).toBeUndefined()
  })
})

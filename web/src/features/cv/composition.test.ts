import { describe, expect, it } from 'vitest'
import type { LibBlock } from '../blocks/types'
import {
  addBlock,
  appendTo,
  compositionFromPlan,
  compositionFromSaved,
  emptyComposition,
  fullComposition,
  moveBy,
  moveSection,
  moveTo,
  normalizeOrder,
  removeBlock,
  setVersion,
  snapshot,
  toSavedItems,
  versionForJob,
  type Composition,
} from './composition'

function block(id: string, section: 'EXPERIENCE' | 'PROJECT', position: number, versions: { id: string; isBase?: boolean; jobIds?: string[] }[]): LibBlock {
  return {
    id,
    slug: id,
    name: id.toUpperCase(),
    section,
    org: '',
    location: '',
    dates: '',
    stack: '',
    position,
    versions: versions.map((v, i) => ({
      id: v.id,
      blockId: id,
      name: v.isBase ? 'Base' : v.id,
      title: v.id,
      isBase: !!v.isBase,
      themes: [],
      position: i,
      bullets: [],
      jobIds: v.jobIds ?? [],
    })),
  }
}

const library: LibBlock[] = [
  block('b', 'EXPERIENCE', 1, [{ id: 'b1', isBase: true }, { id: 'b2', jobIds: ['job1'] }]),
  block('a', 'EXPERIENCE', 0, [{ id: 'a1', isBase: true }]),
  block('p', 'PROJECT', 2, [{ id: 'p1', isBase: true }]),
]

function withRows(rows: Partial<Composition['items']>): Composition {
  return { ...emptyComposition(1), items: { EXPERIENCE: rows.EXPERIENCE ?? [], PROJECT: rows.PROJECT ?? [] } }
}

const abc = withRows({
  EXPERIENCE: [
    { blockId: 'a', versionId: 'a1' },
    { blockId: 'b', versionId: 'b1' },
    { blockId: 'c', versionId: 'c1' },
  ],
})
const ids = (c: Composition, s: 'EXPERIENCE' | 'PROJECT' = 'EXPERIENCE') => c.items[s].map((r) => r.blockId)

describe('composition', () => {
  it('builds rows from a saved CV in position order, skipping versions that no longer exist', () => {
    const c = compositionFromSaved(
      {
        pages: 2,
        sectionOrder: ['PROJECT', 'EXPERIENCE'],
        showEducation: true,
        showSkills: false,
        showAchievements: true,
        savedLabel: 'Saved Nov 3',
        items: [
          { section: 'EXPERIENCE', position: 2, versionId: 'b2' },
          { section: 'EXPERIENCE', position: 1, versionId: 'a1' },
          { section: 'PROJECT', position: 0, versionId: 'gone' },
        ],
      },
      library,
    )

    expect(c.order).toEqual(['PROJECT', 'EXPERIENCE'])
    expect(c.items.EXPERIENCE).toEqual([
      { blockId: 'a', versionId: 'a1' },
      { blockId: 'b', versionId: 'b2' },
    ])
    expect(c.items.PROJECT).toEqual([])
    expect([c.pages, c.skills, c.ach]).toEqual([2, false, true])
  })

  it('makes the full CV from every block, Base versions, in library order', () => {
    const c = fullComposition(library)

    expect(ids(c)).toEqual(['a', 'b'])
    expect(c.items.PROJECT).toEqual([{ blockId: 'p', versionId: 'p1' }])
    expect([c.pages, c.ach]).toEqual([2, true])
  })

  it('finds the version made for a job', () => {
    expect(versionForJob(library[0], 'job1')?.id).toBe('b2')
    expect(versionForJob(library[0], 'other')).toBeNull()
    expect(versionForJob(library[0], null)).toBeNull()
  })

  it('moves a row up and down, and ignores moves past the ends', () => {
    expect(ids(moveBy(abc, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(moveBy(abc, 'b', 1))).toEqual(['a', 'c', 'b'])
    expect(moveBy(abc, 'a', -1)).toBe(abc)
  })

  it('drops a dragged row after a lower target and before a higher one', () => {
    expect(ids(moveTo(abc, 'a', 'c'))).toEqual(['b', 'c', 'a'])
    expect(ids(moveTo(abc, 'c', 'a'))).toEqual(['c', 'a', 'b'])
  })

  it('moves a row across sections, by drop on a row or on an empty section', () => {
    const mixed = withRows({ EXPERIENCE: abc.items.EXPERIENCE, PROJECT: [{ blockId: 'p', versionId: 'p1' }] })

    expect(ids(moveTo(mixed, 'a', 'p'), 'PROJECT')).toEqual(['a', 'p'])
    expect(ids(appendTo(abc, 'b', 'PROJECT'), 'PROJECT')).toEqual(['b'])
    expect(ids(appendTo(abc, 'b', 'PROJECT'))).toEqual(['a', 'c'])
  })

  it('adds a block once, to its own section, and removes it', () => {
    const added = addBlock(emptyComposition(1), library[2], 'p1')

    expect(ids(added, 'PROJECT')).toEqual(['p'])
    expect(addBlock(added, library[2], 'p1')).toBe(added)
    expect(ids(removeBlock(added, 'p'), 'PROJECT')).toEqual([])
  })

  it('switches a version and swaps sections without touching the original', () => {
    const switched = setVersion(abc, 'b', 'b2')

    expect(switched.items.EXPERIENCE[1].versionId).toBe('b2')
    expect(abc.items.EXPERIENCE[1].versionId).toBe('b1')
    expect(moveSection(abc, 'EXPERIENCE', 1).order).toEqual(['PROJECT', 'EXPERIENCE'])
    expect(moveSection(abc, 'EXPERIENCE', -1)).toBe(abc)
  })

  it('numbers saved items in print order and tells unsaved changes apart', () => {
    const c = moveSection(withRows({ EXPERIENCE: [{ blockId: 'a', versionId: 'a1' }], PROJECT: [{ blockId: 'p', versionId: 'p1' }] }), 'EXPERIENCE', 1)

    expect(toSavedItems(c)).toEqual([
      { section: 'PROJECT', versionId: 'p1', position: 0 },
      { section: 'EXPERIENCE', versionId: 'a1', position: 1 },
    ])
    expect(snapshot(c)).toBe(snapshot({ ...c }))
    expect(snapshot(c)).not.toBe(snapshot(setVersion(c, 'a', 'a2')))
  })

  it('keeps every section once in the order', () => {
    expect(normalizeOrder(['PROJECT', 'PROJECT'])).toEqual(['PROJECT', 'EXPERIENCE'])
    expect(normalizeOrder([])).toEqual(['EXPERIENCE', 'PROJECT'])
  })

  it('turns an AI plan into a composition you can edit, ignoring unknown versions', () => {
    const c = compositionFromPlan(
      {
        pages: 1,
        sectionOrder: ['PROJECT'],
        showEducation: true,
        showSkills: true,
        showAchievements: false,
        items: [
          { section: 'PROJECT', position: 0, versionId: 'p1' },
          { section: 'EXPERIENCE', position: 1, versionId: 'b2' },
          { section: 'EXPERIENCE', position: 2, versionId: 'invented' },
        ],
      },
      library,
    )

    expect(c.order).toEqual(['PROJECT', 'EXPERIENCE'])
    expect(ids(c, 'PROJECT')).toEqual(['p'])
    expect(c.items.EXPERIENCE).toEqual([{ blockId: 'b', versionId: 'b2' }])
  })
})

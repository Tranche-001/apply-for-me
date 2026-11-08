import { describe, expect, it } from 'vitest'
import type { LibBlock } from '../blocks/types'
import type { ProfileData } from '../profile/types'
import { emptyComposition, type Composition } from './composition'
import { ONE_SECTION_NAME } from './layout'
import { printCv, sectionsFor } from './print'

const block = (id: string, section: 'EXPERIENCE' | 'PROJECT', position: number): LibBlock => ({
  id,
  slug: id,
  name: id,
  section,
  org: 'Org',
  location: 'Loc',
  dates: '2026',
  stack: 'TS',
  position,
  versions: [{ id: `${id}1`, blockId: id, name: 'Base', title: `${id} title`, isBase: true, themes: [], position: 0, bullets: [{ kind: 'PROJECT', text: 'did it', want: null }], jobIds: [] }],
})

const library = [block('visio', 'EXPERIENCE', 0), block('afm', 'PROJECT', 1), block('rats', 'EXPERIENCE', 2)]
const noProfile: ProfileData = { education: [], skills: [], achievements: [] }
const row = (id: string) => ({ blockId: id, versionId: `${id}1` })

describe('sectionsFor', () => {
  it('two sections: each section with its own blocks, no name of its own', () => {
    const comp: Composition = { ...emptyComposition(1), items: { EXPERIENCE: [row('visio'), row('rats')], PROJECT: [row('afm')] } }
    const sections = sectionsFor(comp, library)
    expect(sections.map((s) => [s.section, s.name, s.entries.map((e) => e.key)])).toEqual([
      ['EXPERIENCE', undefined, ['visio', 'rats']],
      ['PROJECT', undefined, ['afm']],
    ])
  })

  it('one section: every block in one "Experience & Projects" section, in the composition order', () => {
    const comp: Composition = { ...emptyComposition(1), oneSection: true, items: { EXPERIENCE: [row('visio'), row('afm'), row('rats')], PROJECT: [] } }
    const sections = sectionsFor(comp, library)
    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('Experience & Projects')
    expect(sections[0].entries.map((e) => e.key)).toEqual(['visio', 'afm', 'rats'])
    // A project keeps its own look (its block's section), only the heading changes.
    expect(sections[0].entries[1].block.section).toBe('PROJECT')
  })

  it('one section takes rows left in either section, in section order', () => {
    const comp: Composition = { ...emptyComposition(1), oneSection: true, items: { EXPERIENCE: [row('visio')], PROJECT: [row('afm')] } }
    expect(sectionsFor(comp, library)[0].entries.map((e) => e.key)).toEqual(['visio', 'afm'])
  })
})

describe('printCv with one section', () => {
  it('the page has one entries section carrying its name', () => {
    const comp: Composition = { ...emptyComposition(1), edu: false, skills: false, oneSection: true, items: { EXPERIENCE: [row('visio'), row('afm')], PROJECT: [] } }
    const { layout } = printCv(comp, library, noProfile)
    const sections = layout.pages[0].sections.filter((s) => s.kind === 'entries')
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ heading: true, name: ONE_SECTION_NAME })
  })
})

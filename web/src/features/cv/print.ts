// From a composition and the library to what the page model lays out.
import type { LibBlock } from '../blocks/types'
import type { ProfileData } from '../profile/types'
import type { Composition } from './composition'
import { fitOf, layoutCv, pageLabel, type CvLayout, type Fit, type LayoutEntry, type LayoutSectionInput, type PrintBlock, type PrintVersion } from './layout'

export function printBlockOf(b: Pick<LibBlock, 'id' | 'name' | 'section' | 'org' | 'location' | 'dates' | 'stack'>): PrintBlock {
  return { id: b.id, name: b.name, section: b.section, org: b.org, location: b.location, dates: b.dates, stack: b.stack }
}

export type PrintOptions = {
  /** A version shown on hover, not chosen yet. */
  peek?: { blockId: string; versionId: string } | null
  /** The version being edited, as it reads right now. */
  draft?: { blockId: string; version: PrintVersion } | null
  /** A new block being written: it sits at the end of its section. */
  newEntry?: LayoutEntry | null
}

export function sectionsFor(comp: Composition, library: readonly LibBlock[], opts: PrintOptions = {}): LayoutSectionInput[] {
  const blocks = new Map(library.map((b) => [b.id, b]))
  const newSection = opts.newEntry ? (comp.order.includes(opts.newEntry.block.section) ? opts.newEntry.block.section : comp.order[0]) : null
  return comp.order.map((section) => {
    const entries = comp.items[section].flatMap((row): LayoutEntry[] => {
      const block = blocks.get(row.blockId)
      if (!block || !block.versions.length) return []
      const peeked = opts.peek?.blockId === block.id ? block.versions.find((v) => v.id === opts.peek?.versionId) : undefined
      const chosen = block.versions.find((v) => v.id === row.versionId) ?? block.versions[0]
      const drafted = opts.draft?.blockId === block.id ? opts.draft.version : null
      const version = drafted ?? peeked ?? chosen
      return [{ key: block.id, block: printBlockOf(block), version, peeked: !drafted && !!peeked && peeked.id !== row.versionId }]
    })
    return { section, entries: section === newSection && opts.newEntry ? [...entries, opts.newEntry] : entries }
  })
}

export type Printed = { layout: CvLayout; fit: Fit; labels: { text: string; beyond: boolean }[] }

export function printCv(comp: Composition, library: readonly LibBlock[], profile: ProfileData, opts: PrintOptions = {}): Printed {
  const layout = layoutCv({
    pageLimit: comp.pages,
    sections: sectionsFor(comp, library, opts),
    profile,
    show: { showEducation: comp.edu, showSkills: comp.skills, showAchievements: comp.ach },
  })
  const fit = fitOf(layout, comp.pages)
  return { layout, fit, labels: layout.pages.map((_, i) => pageLabel(i, fit)) }
}

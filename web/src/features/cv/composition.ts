// What a CV is made of while you compose it, and the pure moves on it (add, remove, reorder, switch
// version). Every function returns a new composition; nothing is mutated.
import type { Section } from '@prisma/client'
import type { LibBlock, LibVersion } from '../blocks/types'
import type { SavedCv, SavedCvItem } from '../jobs/types'

export type CvRow = { blockId: string; versionId: string }

export type Composition = {
  pages: 1 | 2
  order: Section[]
  items: Record<Section, CvRow[]>
  edu: boolean
  skills: boolean
  ach: boolean
  /**
   * Experience and Projects printed as one "Experience & Projects" section, in print order (`order`, then each
   * section's rows). A one-section CV keeps its rows in the first section. Missing = two sections.
   */
  oneSection?: boolean
}

export const SECTIONS: Section[] = ['EXPERIENCE', 'PROJECT']

const DEFAULT_ORDER: Section[] = ['EXPERIENCE', 'PROJECT']

/** Every section once, in the saved order first. */
export function normalizeOrder(order: readonly Section[]): Section[] {
  const seen = order.filter((s, i) => SECTIONS.includes(s) && order.indexOf(s) === i)
  return [...seen, ...SECTIONS.filter((s) => !seen.includes(s))]
}

export function emptyComposition(pages: 1 | 2): Composition {
  return { pages, order: [...DEFAULT_ORDER], items: { EXPERIENCE: [], PROJECT: [] }, edu: true, skills: true, ach: false }
}

export function versionIndex(library: readonly LibBlock[]): Map<string, { block: LibBlock; version: LibVersion }> {
  return new Map(library.flatMap((block) => block.versions.map((version) => [version.id, { block, version }] as const)))
}

/** Rows from saved items; a version that no longer exists is skipped, and a block appears once. */
export function rowsFromItems(items: readonly SavedCvItem[], library: readonly LibBlock[]): Record<Section, CvRow[]> {
  const index = versionIndex(library)
  const seen = new Set<string>()
  const rows: Record<Section, CvRow[]> = { EXPERIENCE: [], PROJECT: [] }
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const hit = index.get(item.versionId)
    if (!hit || seen.has(hit.block.id)) continue
    seen.add(hit.block.id)
    rows[item.section] = [...rows[item.section], { blockId: hit.block.id, versionId: item.versionId }]
  }
  return rows
}

export function compositionFromSaved(cv: SavedCv, library: readonly LibBlock[]): Composition {
  const order = normalizeOrder(cv.sectionOrder)
  const rows = rowsFromItems(cv.items, library)
  const base = { pages: cv.pages, order, items: rows, edu: cv.showEducation, skills: cv.showSkills, ach: cv.showAchievements }
  if (!cv.oneSection) return base
  // One section: one list in the saved order (items are numbered across sections), kept in the first section.
  return { ...base, oneSection: true, items: rowsFromItems(cv.items.map((i) => ({ ...i, section: order[0] })), library) }
}

export function baseVersion(block: LibBlock): LibVersion {
  return block.versions.find((v) => v.isBase) ?? block.versions[0]
}

/** The version made for this job, if there is one. */
export function versionForJob(block: LibBlock, jobId: string | null): LibVersion | null {
  if (!jobId) return null
  return block.versions.find((v) => v.jobIds.includes(jobId)) ?? null
}

/** The full CV (like CVFINALVISIO.tex): every block in library order, Base versions, two pages. */
export function fullComposition(library: readonly LibBlock[]): Composition {
  const blocks = [...library].filter((b) => b.versions.length).sort((a, b) => a.position - b.position)
  const pick = (section: Section) => blocks.filter((b) => b.section === section).map((b) => ({ blockId: b.id, versionId: baseVersion(b).id }))
  return { pages: 2, order: [...DEFAULT_ORDER], items: { EXPERIENCE: pick('EXPERIENCE'), PROJECT: pick('PROJECT') }, edu: true, skills: true, ach: true }
}

/** A stable string of what Save stores, to tell whether the CV has unsaved changes. */
export function snapshot(c: Composition): string {
  return JSON.stringify({
    pages: c.pages,
    order: c.order,
    items: c.order.map((s) => c.items[s].map((r) => r.versionId)),
    edu: c.edu,
    skills: c.skills,
    ach: c.ach,
    oneSection: c.oneSection ?? false,
  })
}

export function sectionOf(c: Composition, blockId: string): Section | null {
  return c.order.find((s) => c.items[s].some((r) => r.blockId === blockId)) ?? null
}

export function blockIdsIn(c: Composition): Set<string> {
  return new Set(c.order.flatMap((s) => c.items[s].map((r) => r.blockId)))
}

function withSection(c: Composition, section: Section, rows: CvRow[]): Composition {
  return { ...c, items: { ...c.items, [section]: rows } }
}

export function setVersion(c: Composition, blockId: string, versionId: string): Composition {
  const items = Object.fromEntries(
    SECTIONS.map((s) => [s, c.items[s].map((r) => (r.blockId === blockId ? { ...r, versionId } : r))]),
  ) as Record<Section, CvRow[]>
  return { ...c, items }
}

/** Add a block at the end of its own section (or the first section). A block is never added twice. */
export function addBlock(c: Composition, block: LibBlock, versionId: string): Composition {
  if (sectionOf(c, block.id)) return c
  const section = c.order.includes(block.section) ? block.section : c.order[0]
  return withSection(c, section, [...c.items[section], { blockId: block.id, versionId }])
}

export function removeBlock(c: Composition, blockId: string): Composition {
  const items = Object.fromEntries(SECTIONS.map((s) => [s, c.items[s].filter((r) => r.blockId !== blockId)])) as Record<Section, CvRow[]>
  return { ...c, items }
}

export function moveBy(c: Composition, blockId: string, delta: number): Composition {
  const section = sectionOf(c, blockId)
  if (!section) return c
  const list = c.items[section]
  const i = list.findIndex((r) => r.blockId === blockId)
  const j = i + delta
  if (j < 0 || j >= list.length) return c
  return withSection(c, section, list.map((r, k) => (k === i ? list[j] : k === j ? list[i] : r)))
}

export function moveSection(c: Composition, section: Section, delta: number): Composition {
  const i = c.order.indexOf(section)
  const j = i + delta
  if (i === -1 || j < 0 || j >= c.order.length) return c
  return { ...c, order: c.order.map((s, k) => (k === i ? c.order[j] : k === j ? c.order[i] : s)) }
}

/** Drag one block onto another: dropping lower in the same section lands after it, otherwise before it. */
export function moveTo(c: Composition, fromId: string, toId: string): Composition {
  const fromSection = sectionOf(c, fromId)
  const toSection = sectionOf(c, toId)
  if (!fromSection || !toSection || fromId === toId) return c
  const moving = c.items[fromSection].find((r) => r.blockId === fromId)
  if (!moving) return c
  const fromIdx = c.items[fromSection].indexOf(moving)
  const without = withSection(c, fromSection, c.items[fromSection].filter((r) => r.blockId !== fromId))
  const target = without.items[toSection]
  const toIdx = target.findIndex((r) => r.blockId === toId)
  const at = fromSection === toSection && fromIdx <= toIdx ? toIdx + 1 : toIdx
  return withSection(without, toSection, [...target.slice(0, at), moving, ...target.slice(at)])
}

/** Drop a block on an empty section: it moves to the end of that section. */
export function appendTo(c: Composition, fromId: string, section: Section): Composition {
  const fromSection = sectionOf(c, fromId)
  if (!fromSection) return c
  const moving = c.items[fromSection].find((r) => r.blockId === fromId)
  if (!moving) return c
  const without = withSection(c, fromSection, c.items[fromSection].filter((r) => r.blockId !== fromId))
  return withSection(without, section, [...without.items[section], moving])
}

/** What Save stores: one item per block, numbered in print order across sections. */
export function toSavedItems(c: Composition): SavedCvItem[] {
  return c.order.flatMap((section) => c.items[section].map((r) => ({ section, versionId: r.versionId }))).map((x, position) => ({ ...x, position }))
}

/** What Generate proposes (features/ai CvPlan), as a composition to show and edit. Nothing is saved yet. */
export function compositionFromPlan(
  plan: { pages: 1 | 2; sectionOrder: Section[]; showEducation: boolean; showSkills: boolean; showAchievements: boolean; items: SavedCvItem[] },
  library: readonly LibBlock[],
): Composition {
  return {
    pages: plan.pages,
    order: normalizeOrder(plan.sectionOrder),
    items: rowsFromItems(plan.items, library),
    edu: plan.showEducation,
    skills: plan.showSkills,
    ach: plan.showAchievements,
  }
}

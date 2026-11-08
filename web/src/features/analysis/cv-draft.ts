// The CV of the review step: the library plus the drafts you kept, as a composition printCv can lay out.
// Drafts live only in the session until Save, so they get temporary ids (`draft:<key>`, `draftblock:<key>`).
import type { Section } from '@prisma/client'
import type { ReusedVersion, VersionView } from '../ai/types'
import type { LibBlock, LibVersion } from '../blocks/types'
import { emptyComposition, SECTIONS, toSavedItems, type Composition, type CvRow } from '../cv/composition'
import type { SavedCvItem } from '../jobs/types'
import { inOrder, newBlockKey } from './block-key'
import type { Arrangement, SessionDraft } from './types'

const DRAFT_PREFIX = 'draft:'

export function draftVersionId(key: string): string {
  return `${DRAFT_PREFIX}${key}`
}

export function isDraftVersionId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX)
}

const DRAFT_BLOCK_PREFIX = 'draftblock:'
const draftBlockId = (key: string) => `${DRAFT_BLOCK_PREFIX}${key}`

function versionOf(draft: SessionDraft, blockId: string, position: number): LibVersion {
  return {
    id: draftVersionId(draft.key),
    blockId,
    name: draft.name,
    title: draft.title,
    isBase: false,
    themes: [],
    position,
    // MISSING bullets stay: the page model never prints them (layout skips gaps).
    bullets: draft.bullets.map((b) => ({ kind: b.kind, text: b.text, want: b.want ?? null })),
    jobIds: [],
  }
}

/** A new library where every kept draft is a version of its block, or a temporary block of its own. Inputs are untouched. */
export function libraryWithDrafts(library: readonly LibBlock[], drafts: readonly SessionDraft[]): LibBlock[] {
  const kept = drafts.filter((d) => d.keep)
  const withVersions = library.map((block) => {
    const added = kept.filter((d) => d.blockId === block.id)
    if (!added.length) return block
    const top = Math.max(-1, ...block.versions.map((v) => v.position))
    return { ...block, versions: [...block.versions, ...added.map((d, i) => versionOf(d, block.id, top + 1 + i))] }
  })
  const top = Math.max(-1, ...library.map((b) => b.position))
  const fresh = kept
    .filter((d) => !d.blockId && d.newBlock)
    .map((d, i): LibBlock => {
      const nb = d.newBlock!
      const id = draftBlockId(d.key)
      return { id, slug: id, name: nb.name, section: nb.section, org: nb.org, location: nb.location, dates: nb.dates, stack: nb.stack, position: top + 1 + i, versions: [versionOf(d, id, 0)] }
    })
  return [...withVersions, ...fresh]
}

/** A block's key in the AI's order: its id, or for a temporary block (a new block drafted here) its name. */
export const reviewBlockKey = (block: Pick<LibBlock, 'id' | 'name'>): string => (block.id.startsWith(DRAFT_BLOCK_PREFIX) ? newBlockKey(block.name) : block.id)

/**
 * A block of the review CV. `section` is where it sits on this CV, `home` its own section in the library (moving it
 * on the CV never changes that). `swappedIn`: a version the AI left out that you swapped in.
 */
export type ReviewRow = CvRow & { key: string; section: Section; home: Section; swappedIn: boolean }

export type ReviewInput = {
  library: readonly LibBlock[]
  drafts: readonly SessionDraft[]
  reused: readonly ReusedVersion[]
  asIsOut: readonly string[]
  pages: 1 | 2
  /** The AI's order (block keys). */
  order?: readonly string[]
  leftOut?: readonly Pick<VersionView, 'versionId' | 'blockId'>[]
  /** How you arranged the CV; missing = as the AI gave it. */
  arrangement?: Arrangement
}

/**
 * The blocks of the review CV, as one list in print order (`rows`), and the ones you swapped out (`out`). A block
 * with a kept draft uses the draft; otherwise its as-is version unless you took it out (`asIsOut`); otherwise a
 * left-out version you swapped in. The order is yours, else the AI's (only blocks of this CV, each once; the ones it
 * does not name follow in library order); without either (older sessions) the library order.
 */
export function reviewRows(input: ReviewInput): { rows: ReviewRow[]; out: ReviewRow[] } {
  const arrangement = input.arrangement ?? {}
  const library = libraryWithDrafts(input.library, input.drafts)
  const asIsOut = new Set(input.asIsOut)
  const asIs = new Map(input.reused.filter((r) => !asIsOut.has(r.versionId)).map((r) => [r.blockId, r.versionId]))
  const wanted = new Set(arrangement.swappedIn ?? [])
  const swapped = new Map((input.leftOut ?? []).filter((v) => wanted.has(v.versionId)).map((v) => [v.blockId, v.versionId]))
  const all = [...library]
    .sort((a, b) => a.position - b.position)
    .flatMap((block): ReviewRow[] => {
      if (!SECTIONS.includes(block.section)) return []
      const own = block.versions.find((v) => isDraftVersionId(v.id))?.id ?? asIs.get(block.id)
      const versionId = own ?? swapped.get(block.id)
      if (!versionId) return []
      const key = reviewBlockKey(block)
      const section = arrangement.sections?.[key] ?? block.section
      return [{ blockId: block.id, versionId, key, section, home: block.section, swappedIn: !own }]
    })
  const outKeys = new Set(arrangement.swappedOut ?? [])
  const rows = all.filter((r) => !outKeys.has(r.key))
  return { rows: inOrder(rows, (r) => r.key, arrangement.order ?? input.order), out: all.filter((r) => outKeys.has(r.key)) }
}

/** Rows as a composition: two sections (each keeps the rows' order), or one list in the first section. */
export function compositionOfRows(rows: readonly ReviewRow[], pages: 1 | 2, oneSection = false): Composition {
  const base = emptyComposition(pages)
  const cvRow = ({ blockId, versionId }: ReviewRow): CvRow => ({ blockId, versionId })
  if (oneSection) return { ...base, oneSection: true, items: { EXPERIENCE: rows.map(cvRow), PROJECT: [] } }
  const inSection = (section: Section) => rows.filter((r) => r.section === section).map(cvRow)
  return { ...base, items: { EXPERIENCE: inSection('EXPERIENCE'), PROJECT: inSection('PROJECT') } }
}

/**
 * The CV as the review shows it (reviewRows as a composition): EXPERIENCE then PROJECT, or one section when you chose
 * it. Other toggles follow `emptyComposition` (education and skills on, achievements off).
 */
export function compositionForReview(input: ReviewInput): Composition {
  return compositionOfRows(reviewRows(input).rows, input.pages, input.arrangement?.oneSection)
}

/**
 * What Save stores: the composition's items with temporary draft ids swapped for the saved version ids
 * (`idMap`). A draft that was not saved is dropped, and positions are renumbered.
 */
export function savedItemsFor(composition: Composition, idMap: Readonly<Record<string, string>>): SavedCvItem[] {
  return toSavedItems(composition)
    .map((item) => ({ ...item, versionId: Object.hasOwn(idMap, item.versionId) ? idMap[item.versionId] : item.versionId }))
    .filter((item) => !isDraftVersionId(item.versionId))
    .map((item, position) => ({ ...item, position }))
}

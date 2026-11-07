// The CV of the review step: the library plus the drafts you kept, as a composition printCv can lay out.
// Drafts live only in the session until Save, so they get temporary ids (`draft:<key>`, `draftblock:<key>`).
import type { ReusedVersion } from '../ai/types'
import type { LibBlock, LibVersion } from '../blocks/types'
import { emptyComposition, SECTIONS, toSavedItems, type Composition, type CvRow } from '../cv/composition'
import type { SavedCvItem } from '../jobs/types'
import type { SessionDraft } from './types'

const DRAFT_PREFIX = 'draft:'

export function draftVersionId(key: string): string {
  return `${DRAFT_PREFIX}${key}`
}

export function isDraftVersionId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX)
}

const draftBlockId = (key: string) => `draftblock:${key}`

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

/**
 * The CV as the review shows it: EXPERIENCE then PROJECT, blocks in library order. A block with a kept draft
 * uses the draft; otherwise its as-is version, unless you took it out (`asIsOut`). Other toggles follow
 * `emptyComposition` (education and skills on, achievements off).
 */
export function compositionForReview(input: {
  library: readonly LibBlock[]
  drafts: readonly SessionDraft[]
  reused: readonly ReusedVersion[]
  asIsOut: readonly string[]
  pages: 1 | 2
}): Composition {
  const library = libraryWithDrafts(input.library, input.drafts)
  const out = new Set(input.asIsOut)
  const asIs = new Map(input.reused.filter((r) => !out.has(r.versionId)).map((r) => [r.blockId, r.versionId]))
  const rows: Record<string, CvRow[]> = { EXPERIENCE: [], PROJECT: [] }
  for (const block of [...library].sort((a, b) => a.position - b.position)) {
    if (!SECTIONS.includes(block.section)) continue
    const draftVersion = block.versions.find((v) => isDraftVersionId(v.id))
    const versionId = draftVersion?.id ?? asIs.get(block.id)
    if (versionId) rows[block.section] = [...rows[block.section], { blockId: block.id, versionId }]
  }
  return { ...emptyComposition(input.pages), items: { EXPERIENCE: rows.EXPERIENCE, PROJECT: rows.PROJECT } }
}

/**
 * What Save stores: the composition's items with temporary draft ids swapped for the saved version ids
 * (`idMap`). A draft that was not saved is dropped, and positions are renumbered.
 */
export function savedItemsFor(composition: Composition, idMap: Readonly<Record<string, string>>): SavedCvItem[] {
  return toSavedItems(composition)
    .map((item) => ({ ...item, versionId: idMap[item.versionId] ?? item.versionId }))
    .filter((item) => !isDraftVersionId(item.versionId))
    .map((item, position) => ({ ...item, position }))
}

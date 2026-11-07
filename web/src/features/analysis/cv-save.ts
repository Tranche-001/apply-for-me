// Pure parts of "Save" on Job analysis: the kept drafts as the browser sends them, and the CV items with
// the temporary draft ids (`draft:<key>`) swapped for the ids of the versions that were saved.
import { z } from 'zod'
import { draftVersionShape, isNotWaiting, isVersionOrNewBlock, NOT_WAITING_MESSAGE, VERSION_OR_NEW_BLOCK_MESSAGE } from '../ai/draft-schema'
import { isDraftVersionId } from './cv-draft'

/** A kept draft: the library fields plus what the session adds. Unknown keys are dropped. */
export const keptDraftInput = z
  .object({
    ...draftVersionShape,
    key: z.string().trim().min(1, 'is missing').max(80, 'is not a valid key'),
    saveAs: z.enum(['new', 'update']),
    fromVersionId: z.string().trim().min(1).max(64).nullable(),
  })
  .refine(isVersionOrNewBlock, { message: VERSION_OR_NEW_BLOCK_MESSAGE })
  .refine(isNotWaiting, { message: NOT_WAITING_MESSAGE })

export type KeptDraft = z.output<typeof keptDraftInput>

/** True when Save updates the version the draft came from instead of adding a version. */
export function updatesVersion(draft: KeptDraft): draft is KeptDraft & { fromVersionId: string; blockId: string } {
  return draft.saveAs === 'update' && Boolean(draft.fromVersionId) && Boolean(draft.blockId)
}

export type CvItem<S extends string = string> = { section: S; position: number; versionId: string }

/**
 * The items to store: draft ids replaced through `idMap`, a draft that was not saved dropped, a version used
 * once, ordered by position (ties keep their order) and renumbered from 0. Inputs are not changed.
 */
export function mapCvItems<S extends string>(items: readonly CvItem<S>[], idMap: Readonly<Record<string, string>>): CvItem<S>[] {
  const seen = new Set<string>()
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.position - b.item.position || a.index - b.index)
    .map(({ item }) => ({ ...item, versionId: idMap[item.versionId] ?? item.versionId }))
    .filter((item) => !isDraftVersionId(item.versionId) && !seen.has(item.versionId) && seen.add(item.versionId))
    .map((item, position) => ({ ...item, position }))
}

// "Role titles for this job" on the review step (pure): for each experience in the CV, the title the AI recommends
// (from the job's role), the title you have, or one you write. Nothing changes unless you pick it (P2): the default
// is the title you have. The pick lives in the session; Save puts the picked title into this job's version.
import type { RoleTitle } from '../ai/types'
import type { LibBlock } from '../blocks/types'
import type { Composition } from '../cv/composition'
import { draftVersionId, isDraftVersionId, reviewBlockKey } from './cv-draft'
import type { AnalysisSession, SessionDraft, TitleChoice } from './types'

export const DEFAULT_TITLE_CHOICE: TitleChoice = { pick: 'mine', own: '' }

/** One experience of the CV and its three title options. */
export type RoleTitleRow = {
  /** Block key (where the pick is saved). */
  key: string
  /** The block on the page (LayoutEntry.block.id). */
  blockId: string
  versionId: string
  blockName: string
  /** "You have": the title of the version on the CV now. */
  have: string
  /** "AI recommends": the AI's title for this block, else the job's role. */
  ai: string
  choice: TitleChoice
  /** The title the CV shows: "Write my own" with nothing written yet shows the one you have. */
  chosen: string
  /** The chosen title is not the one you have (highlighted on the review page). */
  changed: boolean
  /** A draft saved as "Update “name”": a new title reaches that version wherever it is used. */
  updatesVersion: string | null
}

function chosenTitle(choice: TitleChoice, have: string, ai: string): string {
  if (choice.pick === 'ai') return ai || have
  if (choice.pick === 'own') return choice.own.trim() || have
  return have
}

/** The rows of the card: every experience in the CV, in its order. */
export function roleTitleRows(input: {
  comp: Composition
  /** The library with the kept drafts (libraryWithDrafts). */
  library: readonly LibBlock[]
  drafts: readonly SessionDraft[]
  roleTitles?: readonly RoleTitle[]
  titles?: Readonly<Record<string, TitleChoice>>
  jobRole: string
}): RoleTitleRow[] {
  const blocks = new Map(input.library.map((b) => [b.id, b]))
  return input.comp.items.EXPERIENCE.flatMap((row) => {
    const block = blocks.get(row.blockId)
    const version = block?.versions.find((v) => v.id === row.versionId)
    if (!block || !version) return []
    const key = reviewBlockKey(block)
    const have = version.title
    const ai = input.roleTitles?.find((r) => r.block === key)?.title ?? input.jobRole.trim()
    const choice = (input.titles && Object.hasOwn(input.titles, key) ? input.titles[key] : null) ?? DEFAULT_TITLE_CHOICE
    const chosen = chosenTitle(choice, have, ai)
    const draft = input.drafts.find((d) => draftVersionId(d.key) === row.versionId)
    const updatesVersion = draft?.saveAs === 'update' && draft.fromVersionId ? (draft.fromVersionName ?? 'its version') : null
    return [{ key, blockId: block.id, versionId: version.id, blockName: block.name, have, ai, choice, chosen, changed: chosen !== have, updatesVersion }]
  })
}

/** The pick for one block, saved in the session. */
export function setTitleChoice(s: AnalysisSession, key: string, choice: TitleChoice): AnalysisSession {
  return { ...s, titles: { ...(s.titles ?? {}), [key]: choice } }
}

/** The library as the review page shows it: each experience with its chosen title. Inputs are untouched. */
export function libraryWithTitles(library: readonly LibBlock[], rows: readonly RoleTitleRow[]): LibBlock[] {
  const changed = new Map(rows.filter((r) => r.changed).map((r) => [r.versionId, r.chosen]))
  if (!changed.size) return [...library]
  return library.map((block) =>
    block.versions.some((v) => changed.has(v.id)) ? { ...block, versions: block.versions.map((v) => (changed.has(v.id) ? { ...v, title: changed.get(v.id)! } : v)) } : block,
  )
}

/** A version used as it is that takes another title: Save makes a version of it for this job with that title. */
export type Retitle = { versionId: string; title: string }

/**
 * What Save sends: the kept drafts with their chosen titles, and the versions used as they are whose title changed
 * (never the version itself: a new version for this job gets the title). Inputs are untouched.
 */
export function titlesForSave(drafts: readonly SessionDraft[], rows: readonly RoleTitleRow[]): { drafts: SessionDraft[]; retitled: Retitle[] } {
  const changed = rows.filter((r) => r.changed)
  const byDraft = new Map(changed.filter((r) => isDraftVersionId(r.versionId)).map((r) => [r.versionId, r.chosen]))
  return {
    drafts: drafts.map((d) => (byDraft.has(draftVersionId(d.key)) ? { ...d, title: byDraft.get(draftVersionId(d.key))! } : d)),
    retitled: changed.filter((r) => !isDraftVersionId(r.versionId)).map((r) => ({ versionId: r.versionId, title: r.chosen })),
  }
}

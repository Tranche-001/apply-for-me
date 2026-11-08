// The review CV of a session, the same way on the screen and on the server (REVIEW sends it to the AI): its rows in
// print order, the ones you swapped out, the composition, the library with the kept drafts and the role title rows.
import type { LibBlock } from '../blocks/types'
import type { Composition } from '../cv/composition'
import { compositionOfRows, isDraftVersionId, libraryWithDrafts, reviewInput, reviewRows, type ReviewRow } from './cv-draft'
import { roleTitleRows, type RoleTitleRow } from './role-titles'
import type { AnalysisSession } from './types'

export type ReviewState = { rows: ReviewRow[]; out: ReviewRow[]; comp: Composition; withDrafts: LibBlock[]; titles: RoleTitleRow[] }

export function reviewState(s: AnalysisSession, library: readonly LibBlock[], jobRole: string): ReviewState {
  const { rows, out } = reviewRows(reviewInput(library, s))
  const comp = compositionOfRows(rows, s.pages, s.arrangement?.oneSection)
  const withDrafts = libraryWithDrafts(library, s.drafts)
  const titles = roleTitleRows({ comp, library: withDrafts, drafts: s.drafts, roleTitles: s.analysis.roleTitles, titles: s.titles, jobRole })
  return { rows, out, comp, withDrafts, titles }
}

/** One block of the CV as the AI reads it on REVIEW. */
export type SnapshotRow = { key: string; blockName: string; versionName: string; section: string; home: string; title: string; bullets: string[]; draft: boolean }

/**
 * The CV as it is now (Before), in print order, with the title each experience prints and its bullets; `out` = the
 * blocks you swapped out. Gaps (MISSING bullets) are left out: they never print.
 */
export function reviewSnapshot(s: AnalysisSession, library: readonly LibBlock[], jobRole: string): { rows: SnapshotRow[]; out: SnapshotRow[]; oneSection: boolean } {
  const st = reviewState(s, library, jobRole)
  const blocks = new Map(st.withDrafts.map((b) => [b.id, b]))
  const chosen = new Map(st.titles.map((t) => [t.versionId, t.chosen]))
  const row = (r: ReviewRow): SnapshotRow[] => {
    const block = blocks.get(r.blockId)
    const version = block?.versions.find((v) => v.id === r.versionId)
    if (!block || !version) return []
    const bullets = version.bullets.filter((b) => b.kind !== 'MISSING' && b.text.trim()).map((b) => b.text)
    const draft = isDraftVersionId(r.versionId)
    return [{ key: r.key, blockName: block.name, versionName: draft ? 'new for this job' : version.name, section: r.section, home: r.home, title: chosen.get(r.versionId) ?? version.title, bullets, draft }]
  }
  return { rows: st.rows.flatMap(row), out: st.out.flatMap(row), oneSection: Boolean(s.arrangement?.oneSection) }
}

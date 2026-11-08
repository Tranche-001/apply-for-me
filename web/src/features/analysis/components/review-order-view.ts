// What the "Experience & projects" card shows (pure): the CV's rows grouped as they print, each with its line
// ("Project · 2026 · 2 requirements"), the Swap menu's items, and whether the order is still the AI's.
import type { JobRequirement } from '../../ai/types'
import { arrangementChanged, type SwapChoice } from '../arrangement'
import { blockRequirements, requirementCountLabel } from '../coverage'
import type { ReviewRow } from '../cv-draft'
import type { AnalysisSession } from '../types'
import type { OrderGroup } from './review-order-card'
import type { SwapItem } from './swap-menu'
import { cvViews, type BlockView, type BlockViews } from './view-model'

const KIND = { EXPERIENCE: 'Experience', PROJECT: 'Project' } as const
const SECTION = { EXPERIENCE: 'Experience', PROJECT: 'Projects' } as const

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** "Experience · June 2026 – Present · 3 requirements"; a moved block says where it is: "Project, in Experience · …". */
export function rowLine(row: Pick<ReviewRow, 'section' | 'home'>, view: Pick<BlockView, 'dates' | 'matches'> | null, requirements: readonly JobRequirement[], oneSection: boolean): string {
  const kind = !oneSection && row.section !== row.home ? `${KIND[row.home]}, in ${SECTION[row.section]}` : KIND[row.home]
  const count = requirementCountLabel(blockRequirements(view?.matches ?? [], requirements), { wouldMatch: false })
  return [kind, view?.dates ?? '', count].filter(Boolean).join(' · ')
}

/** The card's groups: Experience then Projects, or one list with one section. `rows` are in print order. */
export function orderGroups(input: { rows: readonly ReviewRow[]; views: BlockViews; requirements: readonly JobRequirement[]; oneSection: boolean }): OrderGroup[] {
  const toRow = (row: ReviewRow) => {
    const view = cvViews(input.views, [row], []).onCv[0] ?? null
    return {
      blockId: row.blockId,
      key: row.key,
      name: view?.blockName ?? row.key,
      // A swapped-in row says which version it is (it can be another version of a block the AI had chosen).
      sub: [rowLine(row, view, input.requirements, input.oneSection), row.swappedIn && view ? `${view.versionName} version` : ''].filter(Boolean).join(' · '),
      swappedIn: row.swappedIn,
      moveTo: input.oneSection ? null : row.section === 'EXPERIENCE' ? ('PROJECT' as const) : ('EXPERIENCE' as const),
    }
  }
  if (input.oneSection) return [{ id: 'all', heading: null, rows: input.rows.map(toRow) }]
  return (['EXPERIENCE', 'PROJECT'] as const)
    .map((section) => ({ id: section, heading: SECTION[section], rows: input.rows.filter((r) => r.section === section).map(toRow) }))
    .filter((g) => g.rows.length > 0)
}

/** The Swap menu: each block it offers, named, with its version and what it would match. */
export function swapItems(choices: readonly SwapChoice[], out: readonly ReviewRow[], views: BlockViews, requirements: readonly JobRequirement[]): SwapItem[] {
  return choices.flatMap((choice) => {
    const row = choice.versionId ? null : out.find((r) => r.key === choice.key)
    const view = row ? cvViews(views, [row], []).onCv[0] : [...views.leftOut, ...views.asIsOut].find((v) => v.versionId === choice.versionId)
    if (!view) return []
    const count = requirementCountLabel(blockRequirements(view.matches, requirements), { wouldMatch: true })
    return [{ key: choice.id, name: view.blockName, sub: `${KIND[choice.home]} · ${view.versionName} · left out · ${lowerFirst(count)}` }]
  })
}

/** "Order suggested by the AI" until you change it; an analysis saved before the AI ordered blocks has the library's. */
export function orderStatus(s: Pick<AnalysisSession, 'arrangement' | 'analysis'>): string {
  if (arrangementChanged(s.arrangement)) return 'Your order'
  return s.analysis.order?.length ? 'Order suggested by the AI' : 'Library order'
}

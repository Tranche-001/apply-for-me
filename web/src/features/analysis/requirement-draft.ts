// "Not met → + Add experience": the block the AI drafted from the new experience text, shaped as a draft of
// "Blocks for this CV" (it comes in with Keep off; the caller sets the session fields).
import type { AnalysisDraft, DraftVersion } from '../ai/types'

export type RequirementDraftContext = {
  requirementId: string
  requirementName: string
  experienceTitle: string
  /** Name of the existing block, when the draft is a new version of one. */
  blockName: string | null
  /** The version of that block the draft starts from (its first one), when there is one. */
  from: { id: string; name: string } | null
}

export function analysisDraftForRequirement(draft: DraftVersion, ctx: RequirementDraftContext): AnalysisDraft {
  return {
    ...draft,
    key: `add-${ctx.requirementId}`,
    blockName: draft.newBlock?.name ?? ctx.blockName ?? '',
    note: `From “${ctx.experienceTitle}”, added for “${ctx.requirementName}”.`,
    fromVersionId: draft.blockId ? (ctx.from?.id ?? null) : null,
    fromVersionName: draft.blockId ? (ctx.from?.name ?? null) : null,
    improvedBy: null,
    matches: [{ requirementId: ctx.requirementId, phrases: [], partly: false }],
  }
}

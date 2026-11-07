// Checks the AI's placement of each written answer against the real experiences: unknown ids are dropped,
// ids never show in the text, a new place is kept only when it is not already an experience (P1: never invent).
import { idNames, nameIds } from './postprocess'
import type { PlacementOutput } from './schemas'
import type { AnswerPlacement } from './types'

export const MAX_ALSO_FITS = 2
const MAX_NEW_NAME = 120

/** One result per item, in the items' order. An answer the AI skipped comes back unplaced. */
export function finalizePlacement(
  raw: PlacementOutput,
  items: readonly { askId: string }[],
  experiences: readonly { id: string; title: string }[],
): AnswerPlacement[] {
  const known = new Set(experiences.map((e) => e.id))
  const names = idNames([], experiences)
  const byAsk = new Map<string, PlacementOutput['placements'][number]>()
  for (const p of raw.placements) if (!byAsk.has(p.askId)) byAsk.set(p.askId, p)

  return items.map(({ askId }): AnswerPlacement => {
    const p = byAsk.get(askId)
    if (!p) return { askId, experienceId: null, alsoFits: [], why: '', newExperienceName: null }
    let experienceId = p.experienceId && known.has(p.experienceId) ? p.experienceId : null
    let newName = experienceId ? null : p.newExperienceName?.replace(/\s+/g, ' ').trim().slice(0, MAX_NEW_NAME).trim() || null
    if (newName) {
      const existing = experiences.find((e) => e.title.trim().toLowerCase() === newName!.toLowerCase())
      if (existing) {
        experienceId = existing.id
        newName = null
      }
    }
    const alsoFits = [...new Set(p.alsoFits)].filter((id) => known.has(id) && id !== experienceId).slice(0, MAX_ALSO_FITS)
    return { askId, experienceId, alsoFits, why: nameIds(p.why, names), newExperienceName: newName }
  })
}

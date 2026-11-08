// What the "Experience & projects" card does to the session. Drag and ↑/↓ use the CV composition's own moves
// (moveTo / moveBy, as Compose does), inside one section; the result goes back into your order with reslot.
// Each action reads the latest session (change), so a drag in progress never works on a stale CV.
import type { Section } from '@prisma/client'
import { moveBy, moveTo, sectionOf, type Composition } from '../../cv/composition'
import { moveToSection, reslot, resetArrangement, setOneSection, setOrder, swapBlock, swapChoices } from '../arrangement'
import { compositionOfRows, reviewRows, type ReviewInput } from '../cv-draft'
import type { AnalysisSession } from '../types'

type Change = (fn: (s: AnalysisSession) => AnalysisSession) => void

export type ReviewOrderActions = ReturnType<typeof reviewOrderActions>

export function reviewOrderActions(change: Change, inputOf: (s: AnalysisSession) => ReviewInput) {
  const arranged = (s: AnalysisSession) => {
    const { rows, out } = reviewRows(inputOf(s))
    return { rows, out, comp: compositionOfRows(rows, s.pages, s.arrangement?.oneSection) }
  }

  /** A move inside the block's section; a move that would leave it (or change nothing) is ignored. */
  const reorder = (blockId: string, move: (c: Composition) => Composition) =>
    change((s) => {
      const { rows, comp } = arranged(s)
      const section = sectionOf(comp, blockId)
      const next = move(comp)
      if (!section || sectionOf(next, blockId) !== section) return s
      const keyOf = new Map(rows.map((r) => [r.blockId, r.key]))
      const all = rows.map((r) => r.key)
      const order = reslot(all, next.items[section].map((r) => keyOf.get(r.blockId) ?? ''))
      return order.join('\n') === all.join('\n') ? s : setOrder(s, order)
    })

  return {
    moveBy: (blockId: string, delta: number) => reorder(blockId, (c) => moveBy(c, blockId, delta)),
    moveTo: (fromId: string, toId: string) => reorder(fromId, (c) => moveTo(c, fromId, toId)),
    swap: (key: string, choiceId: string) =>
      change((s) => {
        const { rows, out } = arranged(s)
        const row = rows.find((r) => r.key === key)
        if (!row) return s
        const choice = swapChoices({ rows, out, leftOut: s.analysis.leftOut, reused: s.analysis.reused, asIsOut: s.asIsOut, arrangement: s.arrangement }, row).find((x) => x.id === choiceId)
        return choice ? swapBlock(s, row, choice, rows.map((r) => r.key)) : s
      }),
    toSection: (key: string, section: Section) =>
      change((s) => {
        const row = arranged(s).rows.find((r) => r.key === key)
        return row ? moveToSection(s, row, section) : s
      }),
    setOneSection: (one: boolean) => change((s) => setOneSection(s, one)),
    reset: () => change(resetArrangement),
  }
}

// The review CV as you arrange it (pure): your order (drag or ↑/↓), Swap with a block the AI left out, a block moved
// to the other section, one "Experience & Projects" section. All of it lives in the session (`arrangement`) and only in
// this CV; the library is never changed. Every function returns a new session.
import type { Section } from '@prisma/client'
import type { LeftOutVersion } from '../ai/types'
import type { ReviewRow } from './cv-draft'
import type { AnalysisSession, Arrangement } from './types'

/** A block you can swap in: one you swapped out (`versionId` null: it comes back as it was) or one the AI left out. */
export type SwapChoice = { key: string; versionId: string | null; home: Section }

const withArrangement = (s: AnalysisSession, patch: Partial<Arrangement>): AnalysisSession => ({ ...s, arrangement: { ...(s.arrangement ?? {}), ...patch } })

/** You changed the AI's CV: an order, a swap or a moved block (One section is a layout, not a change of order). */
export function arrangementChanged(a: Arrangement | undefined): boolean {
  if (!a) return false
  return Boolean(a.order || a.swappedIn?.length || a.swappedOut?.length || Object.keys(a.sections ?? {}).length)
}

/**
 * The whole list (`all`, block keys) with one section's blocks put in `section`'s order, each in a place that section
 * held, so the other section's blocks stay where they were. With one section, `section` is the whole list.
 */
export function reslot(all: readonly string[], section: readonly string[]): string[] {
  const inSection = new Set(section)
  let next = 0
  return all.map((key) => (inSection.has(key) ? section[next++] : key))
}

export const setOrder = (s: AnalysisSession, order: readonly string[]): AnalysisSession => withArrangement(s, { order: [...order] })

/** "Move to Experience" / "Move to Projects": only on this CV; back to its own section clears the move. */
export function moveToSection(s: AnalysisSession, row: Pick<ReviewRow, 'key' | 'home'>, section: Section): AnalysisSession {
  const rest = Object.fromEntries(Object.entries(s.arrangement?.sections ?? {}).filter(([key]) => key !== row.key))
  return withArrangement(s, { sections: section === row.home ? rest : { ...rest, [row.key]: section } })
}

export const setOneSection = (s: AnalysisSession, oneSection: boolean): AnalysisSession => withArrangement(s, { oneSection })

/** "Back to the AI's order": your order, swaps and moves go; One section stays (it is a layout, chosen apart). */
export function resetArrangement(s: AnalysisSession): AnalysisSession {
  const { arrangement, ...rest } = s
  return arrangement?.oneSection ? { ...rest, arrangement: { oneSection: true } } : rest
}

/** The Swap menu: blocks you swapped out (they can come back), then the AI's left-out versions not on the CV. */
export function swapChoices(input: { rows: readonly ReviewRow[]; out: readonly ReviewRow[]; leftOut: readonly LeftOutVersion[]; arrangement?: Arrangement }): SwapChoice[] {
  const onCv = new Set(input.rows.map((r) => r.blockId))
  const swappedIn = new Set(input.arrangement?.swappedIn ?? [])
  const back = input.out.map((r) => ({ key: r.key, versionId: null, home: r.home }))
  const offered = new Set(back.map((c) => c.key))
  const left = input.leftOut
    .filter((v) => !swappedIn.has(v.versionId) && !onCv.has(v.blockId) && !offered.has(v.blockId))
    .map((v) => ({ key: v.blockId, versionId: v.versionId, home: v.section }))
  return [...back, ...left.filter((c, i) => left.findIndex((x) => x.key === c.key) === i)]
}

/**
 * Swap: `choice` takes `row`'s place (same position, same section on this CV) with its requirement matches, and the
 * block that leaves goes to Left out. `order` is the CV's list now (block keys).
 */
export function swapBlock(s: AnalysisSession, row: ReviewRow, choice: SwapChoice, order: readonly string[]): AnalysisSession {
  const a = s.arrangement ?? {}
  const swappedIn = (a.swappedIn ?? []).filter((id) => !(row.swappedIn && id === row.versionId))
  const swappedOut = (a.swappedOut ?? []).filter((key) => key !== choice.key)
  const sections = Object.fromEntries(Object.entries(a.sections ?? {}).filter(([key]) => key !== row.key && key !== choice.key))
  return withArrangement(s, {
    order: order.map((key) => (key === row.key ? choice.key : key)),
    swappedIn: choice.versionId ? [...swappedIn, choice.versionId] : swappedIn,
    swappedOut: row.swappedIn ? swappedOut : [...swappedOut, row.key],
    sections: row.section === choice.home ? sections : { ...sections, [choice.key]: row.section },
  })
}

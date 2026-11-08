// The review CV as you arrange it (pure): your order (drag or ↑/↓), Swap with a block the AI left out, a block moved
// to the other section, one "Experience & Projects" section. All of it lives in the session (`arrangement`) and only in
// this CV; the library is never changed. Every function returns a new session.
import type { Section } from '@prisma/client'
import type { LeftOutVersion, ReusedVersion } from '../ai/types'
import type { ReviewRow } from './cv-draft'
import type { AnalysisSession, Arrangement } from './types'

/**
 * A block you can swap in: one you swapped out (`versionId` null: it comes back as it was), or a version that is left
 * out. `id` tells them apart in the menu (two versions of one block share a key).
 */
export type SwapChoice = { id: string; key: string; versionId: string | null; home: Section }

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

/**
 * The Swap menu of `row`: blocks you swapped out (they come back as they were), then the versions the AI left out and
 * the ones you took out with ×. A version of a block already on the CV is offered only on that block's own row (it
 * takes the place of the version there).
 */
export function swapChoices(
  input: {
    rows: readonly ReviewRow[]
    out: readonly ReviewRow[]
    leftOut: readonly LeftOutVersion[]
    reused: readonly Pick<ReusedVersion, 'versionId' | 'blockId' | 'section'>[]
    asIsOut: readonly string[]
    arrangement?: Arrangement
  },
  row: Pick<ReviewRow, 'key' | 'blockId' | 'versionId'>,
): SwapChoice[] {
  const elsewhere = new Set(input.rows.filter((r) => r.blockId !== row.blockId).map((r) => r.blockId))
  const onCvKeys = new Set(input.rows.filter((r) => r.key !== row.key).map((r) => r.key))
  const swappedIn = new Set(input.arrangement?.swappedIn ?? [])
  const back = input.out.filter((r) => !onCvKeys.has(r.key)).map((r) => ({ id: `back:${r.key}`, key: r.key, versionId: null, home: r.home }))
  const tookOut = new Set(input.asIsOut)
  const pool = [...input.leftOut, ...input.reused.filter((r) => tookOut.has(r.versionId))]
  const versions = pool
    .filter((v) => v.versionId !== row.versionId && !swappedIn.has(v.versionId) && !elsewhere.has(v.blockId))
    .map((v) => ({ id: v.versionId, key: v.blockId, versionId: v.versionId, home: v.section }))
  const all = [...back, ...versions]
  return all.filter((c, i) => all.findIndex((x) => x.id === c.id) === i)
}

/**
 * Swap: `choice` takes `row`'s place (same position, same section on this CV) with its requirement matches, and the
 * block that leaves goes to Left out. `order` is the CV's list now (block keys).
 */
export function swapBlock(s: AnalysisSession, row: ReviewRow, choice: SwapChoice, order: readonly string[]): AnalysisSession {
  const a = s.arrangement ?? {}
  const swappedIn = (a.swappedIn ?? []).filter((id) => !(row.swappedIn && id === row.versionId))
  // Only a block coming back leaves swappedOut; another version of a swapped-out block keeps it out.
  const swappedOut = (a.swappedOut ?? []).filter((key) => choice.versionId !== null || key !== choice.key)
  const sections = Object.fromEntries(Object.entries(a.sections ?? {}).filter(([key]) => key !== row.key && key !== choice.key))
  return withArrangement(s, {
    order: order.map((key) => (key === row.key ? choice.key : key)),
    swappedIn: choice.versionId ? [...swappedIn, choice.versionId] : swappedIn,
    swappedOut: row.swappedIn ? swappedOut : [...swappedOut, row.key],
    sections: row.section === choice.home ? sections : { ...sections, [choice.key]: row.section },
  })
}

// REVIEW after the CV appears (pure): the AI's answer to "How should this CV be better?" checked against this CV and
// the library, as the After CV (P1: an id that is not real is dropped, a title adds no seniority he did not use, new
// wording only for drafts he has not edited). The session stays the Before CV until he keeps one of the two (P2, H3).
import type { Section } from '@prisma/client'
import { cleanOrder, cleanRoleTitles, resolve, type CvBlockRef } from '../ai/cv-order'
import { cleanBullets, cleanReport, findWording, nameIds, type IdNames } from '../ai/postprocess'
import type { CvReviewOutput } from '../ai/schemas'
import type { AiReportLine, LeftOutVersion, RequirementMatch } from '../ai/types'
import type { LibBlock, LibVersion } from '../blocks/types'
import { blockKey, inOrder } from './block-key'
import { reviewInput, reviewRows, type ReviewRow } from './cv-draft'
import { reviewState } from './review-state'
import { SESSION_LIMITS } from './session'
import type { AnalysisSession, Arrangement, CvReview, ReviewAfter, SessionDraft } from './types'

export type ReviewContext = { library: readonly LibBlock[]; jobRole: string; request: string }

const libNames = (library: readonly LibBlock[]): IdNames => ({
  versions: new Map(library.flatMap((b) => b.versions.map((v) => [v.id, v.name] as const))),
  others: new Map(library.map((b) => [b.id, b.name] as const)),
})

const viewOf = (block: LibBlock, v: LibVersion, why: string): LeftOutVersion => ({
  versionId: v.id,
  blockId: block.id,
  blockName: block.name,
  versionName: v.name,
  section: block.section,
  title: v.title,
  org: block.org,
  location: block.location,
  dates: block.dates,
  stack: block.stack,
  bullets: v.bullets.map((b) => ({ kind: b.kind, text: b.text, want: b.want })),
  why,
  matches: [],
})

const refsOf = (rows: readonly ReviewRow[], names: ReadonlyMap<string, string>): CvBlockRef[] =>
  rows.map((r) => ({ key: r.key, section: r.home, name: names.get(r.blockId) ?? r.key, versionId: r.versionId }))

/** Swaps: blocks taken off (`remove`) and versions put on (`add`), as the arrangement and left-out list they need. */
function swaps(s: AnalysisSession, rows: readonly ReviewRow[], raw: CvReviewOutput, ctx: ReviewContext, names: IdNames) {
  const a = s.arrangement ?? {}
  let swappedIn = [...(a.swappedIn ?? [])]
  const swappedOut = new Set(a.swappedOut ?? [])
  const leftOut = [...s.analysis.leftOut]
  const notes: AiReportLine[] = []
  const blockNames = new Map(ctx.library.map((b) => [b.id, b.name]))
  for (const ref of raw.remove) {
    const row = rows.find((r) => r.key === resolve(ref, refsOf(rows, blockNames))?.key)
    if (!row) continue
    if (row.swappedIn) swappedIn = swappedIn.filter((id) => id !== row.versionId)
    else swappedOut.add(row.key)
  }
  const asIsOut = new Set(s.asIsOut)
  const own = new Map(s.analysis.reused.filter((r) => !asIsOut.has(r.versionId)).map((r) => [r.blockId, r.versionId]))
  const drafted = new Set(s.drafts.filter((d) => d.keep).map((d) => blockKey(d)))
  const pool = new Set([...leftOut.map((v) => v.versionId), ...s.analysis.reused.filter((r) => asIsOut.has(r.versionId)).map((r) => r.versionId)])
  let unknown = 0
  for (const { versionId, why } of raw.add) {
    const block = ctx.library.find((b) => b.versions.some((v) => v.id === versionId.trim()))
    const version = block?.versions.find((v) => v.id === versionId.trim())
    if (!block || !version) {
      unknown += 1
      continue
    }
    if (rows.some((r) => r.versionId === version.id)) continue
    swappedIn = swappedIn.filter((id) => !block.versions.some((v) => v.id === id))
    if (own.get(block.id) === version.id && !drafted.has(block.id)) {
      swappedOut.delete(block.id) // his as-is version comes back
      continue
    }
    if (!pool.has(version.id)) {
      if (leftOut.length >= SESSION_LIMITS.versions) continue
      leftOut.push(viewOf(block, version, nameIds(why, names) || 'Added on your review.'))
      pool.add(version.id)
    }
    swappedIn.push(version.id)
    if (own.has(block.id) || drafted.has(block.id)) swappedOut.add(block.id)
  }
  if (unknown) notes.push({ tag: 'NOTE', text: `Skipped ${unknown} ${unknown === 1 ? 'version' : 'versions'} the AI named that ${unknown === 1 ? 'is' : 'are'} not in your library.` })
  return { swappedIn, swappedOut: [...swappedOut], leftOut, notes }
}

/** New wording for a kept draft he has not edited; matches keep only the words still in its bullets. */
function rewordedDrafts(s: AnalysisSession, rows: readonly ReviewRow[], raw: CvReviewOutput, names: IdNames, blockNames: ReadonlyMap<string, string>): SessionDraft[] {
  const refs = refsOf(rows, blockNames)
  return s.drafts.map((d) => {
    if (!d.keep || d.editedByHand) return d
    const change = raw.drafts.find((x) => resolve(x.block, refs)?.key === blockKey(d))
    if (!change) return d
    const bullets = cleanBullets(change.bullets, names).map((b) => ({ ...b, text: b.text.slice(0, SESSION_LIMITS.bulletText) }))
    const texts = bullets.filter((b) => b.kind !== 'MISSING').map((b) => b.text)
    if (!texts.length) return d
    const isProject = (d.newBlock?.section ?? rows.find((r) => r.key === blockKey(d))?.home) === 'PROJECT'
    const matches: RequirementMatch[] = d.matches
      .map((m) => ({ ...m, phrases: m.phrases.filter((p) => texts.some((t) => findWording(t, p))) }))
      .filter((m) => m.phrases.length)
    const title = isProject ? change.title.trim().slice(0, SESSION_LIMITS.short) || d.title : d.title
    return { ...d, title, bullets, note: nameIds(change.note, names).slice(0, SESSION_LIMITS.long) || d.note, matches }
  })
}

/** The After CV from the AI's answer, checked against this CV and the library, and what it changed. */
export function reviewAfter(s: AnalysisSession, raw: CvReviewOutput, ctx: ReviewContext): { after: ReviewAfter; report: AiReportLine[] } {
  const names = libNames(ctx.library)
  const blockNames = new Map(ctx.library.map((b) => [b.id, b.name]))
  for (const d of s.drafts) if (!d.blockId && d.newBlock) blockNames.set(`draftblock:${d.key}`, d.newBlock.name)
  const { rows } = reviewState(s, ctx.library, ctx.jobRole)
  const sw = swaps(s, rows, raw, ctx, names)
  const drafts = rewordedDrafts(s, rows, raw, names, blockNames)
  // The new CV's rows, to place, move and title.
  const interim: Arrangement = { ...(s.arrangement ?? {}), swappedIn: sw.swappedIn, swappedOut: sw.swappedOut }
  const next = reviewRows({ ...reviewInput(ctx.library, { ...s, drafts }), leftOut: sw.leftOut, arrangement: interim }).rows
  const refs = refsOf(next, blockNames)
  const sections: Record<string, Section> = {}
  for (const m of raw.sections) {
    const row = next.find((r) => r.key === resolve(m.block, refs)?.key)
    if (row && m.section !== row.home) sections[row.key] = m.section
  }
  const order = inOrder(next, (r) => r.key, cleanOrder(raw.order, refs)).map((r) => r.key)
  // A title he asked for: role only; a seniority word only when the job's role or his request has it.
  const picked = cleanRoleTitles(raw.roleTitles, refs, `${ctx.jobRole} ${ctx.request}`)
  const titled = new Set(picked.map((t) => t.block))
  return {
    after: {
      drafts,
      titles: { ...(s.titles ?? {}), ...Object.fromEntries(picked.map((t) => [t.block, { pick: 'ai' as const, own: '' }])) },
      arrangement: { order, swappedIn: sw.swappedIn, swappedOut: sw.swappedOut, sections, oneSection: raw.oneSection },
      leftOut: sw.leftOut,
      roleTitles: [...(s.analysis.roleTitles ?? []).filter((t) => !titled.has(t.block)), ...picked],
    },
    report: [...cleanReport(raw.report, names), ...sw.notes].slice(0, SESSION_LIMITS.report).map((l) => ({ ...l, text: l.text.slice(0, SESSION_LIMITS.long) })),
  }
}

/** REVIEW opened with the After CV (the session stays the Before CV). */
export const withReview = (s: AnalysisSession, review: CvReview): AnalysisSession => ({ ...s, review })

/** The session as the After CV (REVIEW closed); with no review open, the session as it is. */
export function afterSession(s: AnalysisSession): AnalysisSession {
  const { review, ...rest } = s
  if (!review) return s
  const { after } = review
  return { ...rest, drafts: after.drafts, titles: after.titles, arrangement: after.arrangement, analysis: { ...s.analysis, leftOut: after.leftOut, roleTitles: after.roleTitles } }
}

/** "Keep After": the After CV becomes the session's CV (saved with the usual Save). */
export const keepAfter = afterSession

/** The status line after Keep Before / Keep After; `learned` = the rules "Remember this" saved, when it was on. */
export function keptLine(which: 'before' | 'after', learned?: { added: number; already: number } | null): string {
  if (which === 'before') return 'Kept Before. The new CV was discarded.'
  if (!learned) return 'Kept After. Save keeps it with the job.'
  if (!learned.added) return 'Kept After. Your rules already say this, so no rule was added.'
  return `Kept After. Saved ${learned.added} ${learned.added === 1 ? 'rule' : 'rules'} as “Learned from use” in Preferences.`
}

/** "Keep Before": the After CV goes; nothing else changes. */
export function keepBefore(s: AnalysisSession): AnalysisSession {
  const { review, ...rest } = s
  return review ? rest : s
}

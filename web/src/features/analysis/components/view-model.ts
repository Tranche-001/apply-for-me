// What the Job analysis screen shows, derived from the session (pure): every block written out with its
// tag and matches, one stable ref per block for the popovers, and small lookups the panels need.
import type { Section } from '@prisma/client'
import type { DraftBullet, JobRequirement, LeftOutVersion, RequirementMatch, ReusedVersion } from '../../ai/types'
import type { LibBlock } from '../../blocks/types'
import { blockRequirements } from '../coverage'
import type { AnalysisSession, SessionDraft } from '../types'
import type { BlockTagKind } from './ui/hit-card'
import type { ChipItem } from './ui/match-chip'

/** A block of this CV (or a candidate), written out in full. `ref` addresses it from any popover. */
export type BlockView = {
  ref: string
  kind: 'draft' | 'asis' | 'asis-out' | 'left-out'
  key: string | null
  versionId: string | null
  /** The library block id, or `draftblock:<key>` for a new block (what the review CV uses). */
  blockId: string
  blockName: string
  versionName: string
  section: Section
  title: string
  dates: string
  stack: string
  bullets: DraftBullet[]
  matches: RequirementMatch[]
  tag: BlockTagKind
  why: string | null
  improvedBy: string | null
  keep: boolean
  isNewBlock: boolean
}

export type BlockViews = { drafts: BlockView[]; asIs: BlockView[]; asIsOut: BlockView[]; leftOut: BlockView[] }

/** What a pencil or a double-click edits: a draft, or a version used as it is. */
export type EditTarget = { type: 'draft'; key: string } | { type: 'asis'; versionId: string }

function draftView(d: SessionDraft, library: readonly LibBlock[]): BlockView {
  const block = d.blockId ? library.find((b) => b.id === d.blockId) : undefined
  const nb = d.newBlock
  return {
    ref: `draft:${d.key}`,
    kind: 'draft',
    key: d.key,
    versionId: null,
    blockId: d.blockId ?? `draftblock:${d.key}`,
    blockName: d.blockName,
    versionName: d.name,
    section: block?.section ?? nb?.section ?? 'EXPERIENCE',
    title: d.title,
    dates: block?.dates ?? nb?.dates ?? '',
    stack: block?.stack ?? nb?.stack ?? '',
    bullets: d.bullets,
    matches: d.matches,
    tag: nb ? 'new-block' : 'new-version',
    why: d.note || null,
    improvedBy: d.improvedBy,
    keep: d.keep,
    isNewBlock: Boolean(nb),
  }
}

function versionView(v: ReusedVersion | LeftOutVersion, kind: 'asis' | 'asis-out' | 'left-out'): BlockView {
  return {
    ref: `${kind === 'asis' ? 'asis' : 'out'}:${v.versionId}`,
    kind,
    key: null,
    versionId: v.versionId,
    blockId: v.blockId,
    blockName: v.blockName,
    versionName: v.versionName,
    section: v.section,
    title: v.title,
    dates: v.dates,
    stack: v.stack,
    bullets: v.bullets,
    matches: v.matches,
    tag: kind === 'asis' ? 'as-is' : 'left-out',
    why: kind === 'asis-out' ? 'You left it out of this CV.' : v.why,
    improvedBy: null,
    keep: kind === 'asis',
    isNewBlock: false,
  }
}

export function blockViews(s: AnalysisSession, library: readonly LibBlock[]): BlockViews {
  const out = new Set(s.asIsOut)
  const reused = s.analysis.reused
  return {
    drafts: s.drafts.map((d) => draftView(d, library)),
    asIs: reused.filter((r) => !out.has(r.versionId)).map((r) => versionView(r, 'asis')),
    asIsOut: reused.filter((r) => out.has(r.versionId)).map((r) => versionView(r, 'asis-out')),
    leftOut: s.analysis.leftOut.map((v) => versionView(v, 'left-out')),
  }
}

export function findView(v: BlockViews, ref: string): BlockView | null {
  return [...v.drafts, ...v.asIs, ...v.asIsOut, ...v.leftOut].find((x) => x.ref === ref) ?? null
}

/** Block name by draft key or version id (what jobReqLine passes). */
export function nameLookup(s: AnalysisSession): (id: string) => string {
  const names = new Map<string, string>([
    ...s.drafts.map((d) => [d.key, d.blockName] as const),
    ...s.analysis.reused.map((r) => [r.versionId, r.blockName] as const),
    ...s.analysis.leftOut.map((l) => [l.versionId, l.blockName] as const),
  ])
  return (id) => names.get(id) ?? id
}

export const requirementOf = (s: AnalysisSession, id: string | null | undefined): JobRequirement | null =>
  (id && s.analysis.requirements.find((r) => r.id === id)) || null

export const askNumber = (s: AnalysisSession, askId: string): number => s.analysis.asks.findIndex((a) => a.id === askId) + 1

/** What a question is about, for short labels ("Kafka · not added"): its requirement, else "Question n". */
export function topicFor(s: AnalysisSession, askId: string): string {
  const ask = s.analysis.asks.find((a) => a.id === askId)
  return requirementOf(s, ask?.requirementId)?.text ?? `Question ${askNumber(s, askId)}`
}

/** The draft or as-is version behind a block of the review CV (double-click to edit). */
export function editTargetForCvBlock(s: AnalysisSession, blockId: string): EditTarget | null {
  const d = s.drafts.find((x) => x.keep && (x.blockId ?? `draftblock:${x.key}`) === blockId)
  if (d) return { type: 'draft', key: d.key }
  const r = s.analysis.reused.find((x) => x.blockId === blockId && !s.asIsOut.includes(x.versionId))
  return r ? { type: 'asis', versionId: r.versionId } : null
}

/** "✓ N requirements" tooltip lines: each requirement with the block's own words (or why it matches). */
export function chipItems(v: Pick<BlockView, 'matches'>, requirements: readonly JobRequirement[]): ChipItem[] {
  return blockRequirements(v.matches, requirements).map((x) => ({
    name: x.requirement.text,
    how: x.phrases.join(' · ') || x.requirement.evidence,
    partly: x.partly,
  }))
}

/** The blocks that show a requirement, with the words that show it. */
export function hitsFor(requirementId: string, views: readonly BlockView[]): { view: BlockView; phrases: string[]; partly: boolean }[] {
  return views.flatMap((view) => {
    const ms = view.matches.filter((m) => m.requirementId === requirementId)
    if (!ms.length) return []
    return [{ view, phrases: ms.flatMap((m) => m.phrases), partly: ms.every((m) => m.partly) }]
  })
}

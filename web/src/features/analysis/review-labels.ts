// The words of "Blocks for this CV" and "Review & save", as the approved prototype (artifact v17) says them.
// Pure: every function reads its arguments and returns a string.
import type { DraftBullet, JobRequirement } from '../ai/types'
import { kindAbbr, printable } from '../blocks/bullets'
import { requirementCountLabel } from './coverage'

export type CardKind = 'new-version' | 'new-block' | 'as-is'
export type ReviewGroup = 'new' | 'asis' | 'out'
export type KindTone = 'k-P' | 'k-S' | 'k-I' | 'k-M'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** The panel's small summary: "1 new version · 3 as is", "2 new versions · 1 new block · 3 as is", "Nothing yet". */
export function blocksSummary(kinds: readonly CardKind[]): string {
  const count = (k: CardKind) => kinds.filter((x) => x === k).length
  const versions = count('new-version')
  const blocks = count('new-block')
  const asIs = count('as-is')
  const parts = [versions ? `${versions} new version${versions === 1 ? '' : 's'}` : '', blocks ? `${blocks} new block${blocks === 1 ? '' : 's'}` : '', asIs ? `${asIs} as is` : '']
  return parts.filter(Boolean).join(' · ') || 'Nothing yet'
}

/** The undo line after × on a card: "Discarded BI Dashboard." or "Left IAAS! out of this CV." */
export function discardedLabel(blockName: string, kind: 'discard' | 'leave-out'): string {
  return kind === 'discard' ? `Discarded ${blockName}.` : `Left ${blockName} out of this CV.`
}

/** The amber chip on a draft whose gap a question can fill. */
export function improvesLabel(question: number): string {
  return `Q${question} can improve it`
}

/** The P / S / I tag of a bullet and its tone; a gap shows the kind it wants, in amber. */
export function bulletTag(b: Pick<DraftBullet, 'kind' | 'want'>): { label: string; tone: KindTone } {
  if (b.kind === 'MISSING') return { label: kindAbbr({ kind: printable(b.want), want: null }), tone: 'k-M' }
  const label = kindAbbr({ kind: b.kind, want: null })
  return { label, tone: `k-${label[0]}` as KindTone }
}

/** A gap bullet, never printed: its note in brackets (P1). */
export function gapHint(b: Pick<DraftBullet, 'text'>): string {
  return `[${b.text.trim() || 'Impact: what came out of it?'}]`
}

/**
 * The line under a block in the review's list: "3 requirements · Leads with RAG and pgvector" (new),
 * "1 requirement · version “Web Full-Stack”" (as is), "Would match 1 requirement + 1 partly" (left out).
 */
export function reviewBlockSub(input: {
  group: ReviewGroup
  matches: readonly { partly: boolean }[]
  note?: string | null
  versionName?: string | null
}): string {
  const out = input.group === 'out'
  const count = requirementCountLabel(input.matches, { wouldMatch: out })
  const extra = input.group === 'new' ? input.note?.trim() : input.group === 'asis' && input.versionName ? `version “${input.versionName}”` : ''
  return [count, extra].filter(Boolean).join(' · ')
}

/** "NEW VERSION" / "NEW BLOCK" next to a block new for this job; nothing for the others. */
export function reviewBlockTag(group: ReviewGroup, isNewBlock: boolean): string | null {
  if (group !== 'new') return null
  return isNewBlock ? 'NEW BLOCK' : 'NEW VERSION'
}

/** "· 6 of 7 met", after "Requirements". */
export function metCountLine(met: number, total: number): string {
  return `· ${met} of ${total} met`
}

/** The blocks that show a requirement, each named once: "Visio AI, BI Dashboard, Semcomp website". */
export function metBlocksLine(hits: readonly { blockName: string }[]): string {
  return [...new Set(hits.map((h) => h.blockName))].join(', ')
}

/** The review's primary button: "Save 3 versions and the CV". */
export function saveLabel(versions: number): string {
  return versions ? `Save ${plural(versions, 'version')} and the CV` : 'Save the CV'
}

/** The green banner once saved: "✓ Saved 3 to your library and the CV for <job>." */
export function savedBannerText(saved: number, jobLabel: string): string {
  return saved ? `✓ Saved ${saved} to your library and the CV for ${jobLabel}.` : `✓ Saved the CV for ${jobLabel}.`
}

/**
 * The chip under a block: "✓ 2 requirements" and, in amber, "· 1 partly"; a block that only partly matches
 * says "– 1 requirement, partly" (never "✓ 0 requirements · 1 partly"). The list is never empty here.
 */
export function matchChipLabel(list: readonly { partly: boolean }[]): { lead: string | null; partly: string | null } {
  const full = list.filter((x) => !x.partly).length
  const part = list.length - full
  if (!full) return { lead: null, partly: `– ${plural(part, 'requirement')}, partly` }
  return { lead: `✓ ${plural(full, 'requirement')}`, partly: part ? `· ${part} partly` : null }
}

/** The block popover's right column: "Matches 3 requirements", "Would match 1 requirement + 1 partly". */
export function blockMatchTitle(list: readonly { partly: boolean }[], leftOut: boolean): string {
  if (!list.length) return 'No requirement of this job'
  return leftOut ? requirementCountLabel(list, { wouldMatch: true }) : `Matches ${requirementCountLabel(list, { wouldMatch: false })}`
}

/** The met popover's right column: "Your CV shows it · 3 blocks". */
export function cvShowsLabel(blocks: number): string {
  return `Your CV shows it · ${plural(blocks, 'block')}`
}

/** What the requirement is about, for "What you built with …": the posting's first two keys, else its text. */
export function requirementTopic(r: Pick<JobRequirement, 'text' | 'keys'>): string {
  const seen = new Set<string>()
  const keys = r.keys
    .map((k) => k.trim())
    .filter((k) => {
      const low = k.toLowerCase()
      if (!k || seen.has(low)) return false
      seen.add(low)
      return true
    })
    .slice(0, 2)
  return keys.length ? keys.join(' or ') : r.text
}

/** The not-met popover once sent: "✓ Added to Visio AI." or "✓ Added to Kafka side project (new)." */
export function addedToLabel(place: string, isNew: boolean): string {
  return `✓ Added to ${place}${isNew ? ' (new)' : ''}.`
}

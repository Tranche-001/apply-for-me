// The order of the CV's blocks and the role titles the AI recommends, checked against what is really in this
// analysis: a block the CV does not have is dropped, each block counts once, and a recommended title that adds
// seniority the job does not ask for is dropped (P1: drop, never invent).
import type { Section } from '@prisma/client'
import { newBlockKey } from '../analysis/block-key'
import type { RoleTitle } from './types'

/** A block of this CV: a draft (of a library block or a new one) or a version used as it is. */
export type CvBlockRef = { key: string; section: Section; name: string; versionId: string | null }

const MAX_TITLE = 120

/** Words that make a title more senior. The AI may use one only when the job's role has it too. */
const SENIORITY = /\b(senior|sênior|sr|lead|principal|staff|head|chief|director|manager|vp|pleno|specialist|especialista|architect)\b/giu

/** The block `ref` names: its key, a new block's name, a reused version's id, or a block's name; null when none. */
function resolve(ref: string, blocks: readonly CvBlockRef[]): CvBlockRef | null {
  const wanted = ref.trim()
  if (!wanted) return null
  const lower = wanted.toLowerCase()
  return (
    blocks.find((b) => b.key === wanted) ??
    blocks.find((b) => b.key === newBlockKey(wanted)) ??
    blocks.find((b) => b.versionId === wanted) ??
    blocks.find((b) => b.name.trim().toLowerCase() === lower) ??
    null
  )
}

/** The block keys of `order` that are blocks of this CV, each once, in the AI's order. */
export function cleanOrder(order: readonly string[], blocks: readonly CvBlockRef[]): string[] {
  const keys = order.map((ref) => resolve(ref, blocks)?.key).filter((k): k is string => Boolean(k))
  return keys.filter((k, i) => keys.indexOf(k) === i)
}

const seniorityIn = (text: string): Set<string> => new Set([...text.matchAll(SENIORITY)].map((m) => m[0].toLowerCase()))

/** True when `title` has a seniority word that the job's role does not have. */
export function addsSeniority(title: string, jobRole: string): boolean {
  const allowed = seniorityIn(jobRole)
  return [...seniorityIn(title)].some((w) => !allowed.has(w))
}

/**
 * One recommended title per experience block of this CV: trimmed, at most 120 characters, never more senior than
 * the job's role. A title for a project, an unknown block, or a second title for the same block is dropped.
 */
export function cleanRoleTitles(raw: readonly RoleTitle[], blocks: readonly CvBlockRef[], jobRole: string): RoleTitle[] {
  const out: RoleTitle[] = []
  for (const r of raw) {
    const block = resolve(r.block, blocks)
    const title = r.title.replace(/\s+/g, ' ').trim()
    if (!block || block.section !== 'EXPERIENCE' || !title || title.length > MAX_TITLE) continue
    if (addsSeniority(title, jobRole) || out.some((o) => o.block === block.key)) continue
    out.push({ block: block.key, title })
  }
  return out
}

// Which job requirements a block, or the whole CV, shows. Pure; nothing is mutated.
import type { JobAnalysis, JobRequirement, RequirementMatch, RequirementStatus } from '../ai/types'

export type BlockRequirement = { requirement: JobRequirement; phrases: string[]; partly: boolean }

/** The requirements a block matches, with its matching words; matches naming an unknown requirement are skipped. */
export function blockRequirements(matches: readonly RequirementMatch[], requirements: readonly JobRequirement[]): BlockRequirement[] {
  const byId = new Map(requirements.map((r) => [r.id, r]))
  return matches.flatMap((m) => {
    const requirement = byId.get(m.requirementId)
    return requirement ? [{ requirement, phrases: [...m.phrases], partly: m.partly }] : []
  })
}

const requirements = (n: number): string => `${n} requirement${n === 1 ? '' : 's'}`

/**
 * "3 requirements", "2 requirements + 1 partly", "Would match 1 requirement + 1 partly", "No requirement";
 * only partly: "1 requirement, partly" (never "0 requirements + 1 partly").
 */
export function requirementCountLabel(list: readonly { partly: boolean }[], opts: { wouldMatch: boolean }): string {
  if (!list.length) return 'No requirement'
  const full = list.filter((x) => !x.partly).length
  const partly = list.length - full
  const count = full ? `${requirements(full)}${partly ? ` + ${partly} partly` : ''}` : `${requirements(partly)}, partly`
  return `${opts.wouldMatch ? 'Would match ' : ''}${count}`
}

export type CvHit = { id: string; blockName: string; phrases: string[]; partly: boolean }
export type MetRequirement = { requirement: JobRequirement; hits: CvHit[]; partly: boolean }

/**
 * Review: which requirements the kept blocks show. Choice: a requirement shown only partly counts as MET,
 * flagged `partly: true` (the screen shows "partly"); it is "not met" only when no kept block matches it at all.
 */
export function cvRequirements(
  analysis: Pick<JobAnalysis, 'requirements'>,
  kept: readonly { id: string; blockName: string; matches: readonly RequirementMatch[] }[],
): { met: MetRequirement[]; notMet: JobRequirement[] } {
  const met: MetRequirement[] = []
  const notMet: JobRequirement[] = []
  for (const requirement of analysis.requirements) {
    const hits = kept.flatMap((k) =>
      k.matches.filter((m) => m.requirementId === requirement.id).map((m) => ({ id: k.id, blockName: k.blockName, phrases: [...m.phrases], partly: m.partly })),
    )
    if (hits.length) met.push({ requirement, hits, partly: hits.every((h) => h.partly) })
    else notMet.push(requirement)
  }
  return { met, notMet }
}

/**
 * The short line under a requirement. "before" looks at the versions you already have (as is + left out),
 * "after" at the as-is versions plus the drafts. `blockNameOf` gets a version id (as is / left out) or a draft key.
 */
export function jobReqLine(
  status: RequirementStatus,
  requirementId: string,
  analysis: Pick<JobAnalysis, 'asks' | 'drafts' | 'reused' | 'leftOut'>,
  phase: 'before' | 'after',
  blockNameOf: (id: string) => string,
): string {
  const shows = (matches: readonly RequirementMatch[]) => matches.some((m) => m.requirementId === requirementId)
  // v2 drafts exist before any answer (a version made from what you have, with a gap), so both phases count
  // them; before the answers the blocks left out count too, since they are still candidates.
  const ids = [
    ...analysis.reused.filter((v) => shows(v.matches)).map((v) => v.versionId),
    ...analysis.drafts.filter((d) => shows(d.matches)).map((d) => d.key),
    ...(phase === 'before' ? analysis.leftOut.filter((v) => shows(v.matches)).map((v) => v.versionId) : []),
  ]
  const names = [...new Set(ids.map(blockNameOf))].join(', ')
  if (status === 'covered') return names
  if (phase === 'after') return status === 'partial' && names ? `${names} · partly` : 'You don’t have it · add an experience'
  const index = analysis.asks.findIndex((a) => a.requirementId === requirementId)
  return [names || 'Nothing in your blocks yet', index >= 0 ? `Q${index + 1} asks about it` : ''].filter(Boolean).join(' · ')
}

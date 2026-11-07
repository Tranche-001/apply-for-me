// Job links: their short name, type and validity, and how a job is named.
import type { LinkKind } from '@prisma/client'

export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  POSTING: 'Job posting',
  APPLICATION: 'Application',
  COMPANY: 'Company site',
  OTHER: 'Other',
}

export const LINK_KINDS: LinkKind[] = ['POSTING', 'APPLICATION', 'COMPANY', 'OTHER']

/** "Company · Role", or whichever of the two you gave. */
export function jobLabel(company: string, role: string): string {
  const c = company.trim()
  const r = role.trim()
  return c && r ? `${c} · ${r}` : r || c
}

/** Host shown for a link: "LinkedIn", "Gupy", or the bare host name. */
export function linkText(url: string): string {
  const host = url
    .replace(/^https?:\/\//i, '')
    .split(/[/?#]/)[0]
    .replace(/^www\./i, '')
    .toLowerCase()
  if (/(^|\.)linkedin\.com$/.test(host)) return 'LinkedIn'
  if (/(^|\.)gupy\.io$/.test(host)) return 'Gupy'
  return host
}

/** Adds https:// when you pasted a link without it. */
export function normalizeUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

/** A full web link with a dotted host name. */
export function isValidUrl(url: string): boolean {
  return /^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)+([/?#]\S*)?$/i.test(url)
}

/** Job boards and application systems are recognised; any other link keeps the type you picked. */
export function guessLinkKind(url: string): LinkKind | null {
  const u = url.toLowerCase()
  if (/linkedin\.com|indeed\.|glassdoor\./.test(u)) return 'POSTING'
  if (/gupy\.io|greenhouse\.io|lever\.co|workday|smartrecruiters|ashbyhq|inhire|amazon\.jobs/.test(u)) return 'APPLICATION'
  return null
}

/** The first type not used yet, so a second link defaults to something useful. */
export function nextLinkKind(used: readonly LinkKind[]): LinkKind {
  return (['POSTING', 'APPLICATION', 'COMPANY'] as LinkKind[]).find((k) => !used.includes(k)) ?? 'OTHER'
}

/** Case-insensitive match on the job's name, to catch duplicates before they are created (H5). */
export function findJobByLabel<J extends { label: string }>(jobs: readonly J[], label: string): J | null {
  const low = label.trim().toLowerCase()
  if (!low) return null
  return jobs.find((j) => j.label.toLowerCase() === low) ?? null
}

/** "Nubank · Backend" typed in the search becomes company + role. */
export function splitJobQuery(query: string): { company: string; role: string } {
  const parts = query.trim().split(/\s*·\s*/)
  return parts.length > 1 ? { company: parts[0], role: parts.slice(1).join(' · ') } : { company: query.trim(), role: '' }
}

/** Search a job by company, role or any of its links. */
export function jobMatches(job: { label: string; links: { url: string }[] }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return `${job.label} ${job.links.map((l) => l.url).join(' ')}`.toLowerCase().includes(q)
}

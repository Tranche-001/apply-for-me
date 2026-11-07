// The company and role the AI read from a posting, made safe to use as a Job's names.
// Pure and server-agnostic.
import type { JobInfoOutput } from './schemas'

const MAX_COMPANY = 120
const MAX_ROLE = 160

const tidy = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max).trim()

export type JobNames = { company: string; role: string }

/** White space collapsed, lengths capped to what a job accepts. */
export function finalizeJobInfo(raw: JobInfoOutput): JobNames {
  return { company: tidy(raw.company, MAX_COMPANY), role: tidy(raw.role, MAX_ROLE) }
}

/**
 * The names the job is stored under. A job needs a role: when the AI found none, the page title stands in
 * (never made up); with neither, null. An empty company is fine (the label is then the role alone).
 */
export function jobNamesFrom(info: JobNames, pageTitle: string | null): JobNames | null {
  const role = info.role || tidy(pageTitle ?? '', MAX_ROLE)
  return role ? { company: info.company, role } : null
}

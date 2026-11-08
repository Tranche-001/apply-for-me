// The names a Job is stored under, from what the AI read (see posting-jobs.ts). Pure and server-agnostic.
const MAX_ROLE = 160

const tidy = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max).trim()

export type JobNames = { company: string; role: string }

/**
 * The names the job is stored under. A job needs a role: when the AI found none, the page title stands in
 * (never made up); with neither, null. An empty company is fine (the label is then the role alone).
 */
export function jobNamesFrom(info: JobNames, pageTitle: string | null): JobNames | null {
  const role = info.role || tidy(pageTitle ?? '', MAX_ROLE)
  return role ? { company: info.company, role } : null
}

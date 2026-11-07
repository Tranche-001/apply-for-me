import 'server-only'
import { db } from '@/lib/db'
import { jobLabel } from '../ai/labels'
import type { ExperienceOption, JobSummary } from './types'

/** Every job, most recently changed first, with its links and how much posting text is saved. */
export async function listJobsForAnalysis(): Promise<JobSummary[]> {
  const [jobs, lengths] = await Promise.all([
    db.job.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, company: true, role: true, links: { orderBy: { position: 'asc' }, select: { id: true, kind: true, url: true } } },
    }),
    // Only the length: the posting text itself can be long and stays on the server.
    db.$queryRaw<{ id: string; chars: number }[]>`SELECT "id", length("postingText")::int AS "chars" FROM "Job"`,
  ])
  const chars = new Map(lengths.map((l) => [l.id, Number(l.chars)]))
  return jobs.map((j) => ({ id: j.id, company: j.company, role: j.role, label: jobLabel(j), links: j.links, postingChars: chars.get(j.id) ?? 0 }))
}

/** Experiences a gap answer can be added to, in the order of the Experiences list. */
export async function listExperienceOptions(): Promise<ExperienceOption[]> {
  const rows = await db.experience.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true } })
  return rows.map((e) => ({ id: e.id, title: e.title.trim() || 'Untitled experience' }))
}

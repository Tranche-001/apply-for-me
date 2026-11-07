'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { UserError, fail, firstIssue, guarded, type ActionResult } from '@/features/cv/action-result'
import { findJobByLabel, isValidUrl, jobLabel, normalizeUrl } from './links'
import { toJobData } from './queries'
import type { JobData } from './types'

const MAX_LINKS = 10

const createJobSchema = z.object({
  company: z.string().trim().max(120, 'Keep the company name under 120 characters.'),
  role: z.string().trim().min(1, 'Add the role. It names the job everywhere in the app.').max(160),
  links: z
    .array(z.object({ kind: z.enum(['POSTING', 'APPLICATION', 'COMPANY', 'OTHER']), url: z.string().trim().max(2000) }))
    .max(MAX_LINKS, `A job holds at most ${MAX_LINKS} links.`),
})

/** Compose CV → "+ New job": company, role and typed links; duplicates are caught first (H5). */
export async function createJob(input: z.input<typeof createJobSchema>): Promise<ActionResult<JobData>> {
  const parsed = createJobSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const d = parsed.data
  const links = d.links.filter((l) => l.url).map((l) => ({ kind: l.kind, url: normalizeUrl(l.url) }))
  if (links.some((l) => !isValidUrl(l.url))) return fail('One of the links isn’t a full link. Copy it from the browser’s address bar.')
  const result = await guarded('createJob', 'Couldn’t create the job. Try again.', () =>
    db.$transaction(async (tx) => {
      const existing = await tx.job.findMany({ select: { company: true, role: true } })
      const label = jobLabel(d.company, d.role)
      if (findJobByLabel(existing.map((j) => ({ label: jobLabel(j.company, j.role) })), label)) {
        throw new UserError(`You already have “${label}”.`)
      }
      const job = await tx.job.create({
        data: { company: d.company, role: d.role, links: { create: links.map((l, position) => ({ ...l, position })) } },
        include: { links: { orderBy: { position: 'asc' } }, cv: { include: { items: { orderBy: { position: 'asc' } } } } },
      })
      return toJobData(job)
    }),
  )
  if (result.ok) refresh()
  return result
}

// A job row as the screens get it (serializable; the posting text itself stays on the server).
import type { LinkKind } from '@prisma/client'
import { jobLabel } from '../ai/labels'
import type { JobSummary } from './types'

export type JobRow = {
  id: string
  company: string
  role: string
  postingText: string
  links: { id: string; kind: LinkKind; url: string }[]
}

export function toJobSummary(job: JobRow): JobSummary {
  return {
    id: job.id,
    company: job.company,
    role: job.role,
    label: jobLabel(job),
    links: job.links.map((l) => ({ id: l.id, kind: l.kind, url: l.url })),
    postingChars: job.postingText.length,
  }
}

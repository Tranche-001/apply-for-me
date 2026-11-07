import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { jobLabel } from './links'
import type { BehavioralForJobs, JobData, SavedCv } from './types'

const jobInclude = {
  links: { orderBy: { position: 'asc' } },
  cv: { include: { items: { orderBy: { position: 'asc' } } } },
} satisfies Prisma.JobInclude

// db omits Job.analysis by default (src/lib/db.ts).
type JobRow = Prisma.JobGetPayload<{ include: typeof jobInclude; omit: { analysis: true } }>

function savedLabel(source: string, savedAt: Date): string {
  if (source.trim()) return source.trim()
  return `Saved ${savedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

function toSavedCv(cv: NonNullable<JobRow['cv']>): SavedCv {
  return {
    pages: cv.pages === 2 ? 2 : 1,
    sectionOrder: cv.sectionOrder,
    showEducation: cv.showEducation,
    showSkills: cv.showSkills,
    showAchievements: cv.showAchievements,
    savedLabel: savedLabel(cv.source, cv.savedAt),
    items: cv.items.map((i) => ({ section: i.section, position: i.position, versionId: i.versionId })),
  }
}

export function toJobData(j: JobRow): JobData {
  return {
    id: j.id,
    company: j.company,
    role: j.role,
    label: jobLabel(j.company, j.role),
    links: j.links.map((l) => ({ kind: l.kind, url: l.url })),
    cv: j.cv ? toSavedCv(j.cv) : null,
  }
}

/** Every job, newest first, with its links and the CV saved for it. */
export async function listJobs(): Promise<JobData[]> {
  const jobs = await db.job.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], include: jobInclude })
  return jobs.map(toJobData)
}

/** Read only: your behavioral answers and the ones adapted to each job (edited in Behavioral). */
export async function getBehavioralForJobs(): Promise<BehavioralForJobs> {
  const [questions, tailored] = await Promise.all([
    db.behavioralQuestion.findMany({ orderBy: { position: 'asc' }, select: { id: true, position: true, short: true, answer: true } }),
    db.tailoredAnswer.findMany({ select: { questionId: true, jobId: true, text: true } }),
  ])
  return {
    questions,
    tailored: Object.fromEntries(tailored.map((t) => [`${t.questionId}|${t.jobId}`, t.text])),
  }
}

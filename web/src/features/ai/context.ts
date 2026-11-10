import 'server-only'
// Reads what the AI needs from the database and turns it into plain context objects.
import { db } from '@/lib/db'
import type { ExperienceContext, JobContext, LibraryBlock, ProfileContext, QuestionContext } from './context-types'
import { jobLabel } from './labels'

export type RuleGroup = 'cv' | 'qa'

export async function loadLibrary(): Promise<LibraryBlock[]> {
  const blocks = await db.block.findMany({
    orderBy: [{ section: 'asc' }, { position: 'asc' }],
    include: {
      experience: { select: { title: true } },
      versions: {
        orderBy: [{ isBase: 'desc' }, { position: 'asc' }],
        include: {
          bullets: { orderBy: { position: 'asc' } },
          jobs: { include: { job: { select: { company: true, role: true } } } },
        },
      },
    },
  })
  return blocks.map((b) => ({
    id: b.id,
    name: b.name,
    section: b.section,
    org: b.org,
    location: b.location,
    dates: b.dates,
    stack: b.stack,
    experienceTitle: b.experience?.title ?? null,
    versions: b.versions.map((v) => ({
      id: v.id,
      name: v.name,
      title: v.title,
      isBase: v.isBase,
      themes: v.themes,
      jobs: v.jobs.map((vj) => jobLabel(vj.job)),
      bullets: v.bullets.map((x) => ({ kind: x.kind, text: x.text, want: x.want })),
    })),
  }))
}

export async function loadProfile(): Promise<ProfileContext> {
  const [education, skills, achievements] = await Promise.all([
    db.educationEntry.findMany({ orderBy: { position: 'asc' } }),
    db.skillLine.findMany({ orderBy: { position: 'asc' } }),
    db.achievement.findMany({ orderBy: { position: 'asc' } }),
  ])
  return {
    education: education.map((e) => ({ degree: e.degree, dates: e.dates, school: e.school, location: e.location })),
    skills: skills.map((s) => ({ label: s.label, text: s.text })),
    achievements: achievements.map((a) => ({ title: a.title, description: a.description })),
  }
}

/** The switched-on style rules of one group ("cv" for blocks and CVs, "qa" for interview answers). */
export async function loadRules(group: RuleGroup): Promise<string[]> {
  const rules = await db.preferenceRule.findMany({ where: { group, on: true }, orderBy: { position: 'asc' } })
  return rules.map((r) => r.text)
}

export async function loadJob(jobId: string): Promise<JobContext | null> {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { links: { orderBy: { position: 'asc' } } } })
  if (!job) return null
  return {
    id: job.id,
    label: jobLabel(job),
    company: job.company,
    role: job.role,
    postingText: job.postingText,
    links: job.links.map((l) => ({ kind: l.kind, url: l.url })),
  }
}

export async function loadExperiences(): Promise<ExperienceContext[]> {
  const rows = await db.experience.findMany({ orderBy: { position: 'asc' }, include: { blocks: { select: { id: true } } } })
  return rows.map((e) => ({ id: e.id, title: e.title, where: e.where, when: e.when, notes: e.notes, blockIds: e.blocks.map((b) => b.id) }))
}

export async function loadQuestion(questionId: string): Promise<QuestionContext | null> {
  const q = await db.behavioralQuestion.findUnique({ where: { id: questionId } })
  if (!q) return null
  return {
    id: q.id,
    short: q.short,
    full: q.full,
    looksFor: q.looksFor,
    answer: q.answer,
    answerPt: q.answerPt,
    theory: q.theory,
    references: q.references,
    useFounder: q.useFounder,
    founderNotes: q.founderNotes,
    founderRefs: q.founderRefs,
  }
}

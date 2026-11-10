import type { LinkKind, Section } from '@prisma/client'

export type JobLinkData = { kind: LinkKind; url: string }

export type SavedCvItem = { section: Section; position: number; versionId: string }

/** The CV saved for a job (read from Cv + CvItem). */
export type SavedCv = {
  pages: 1 | 2
  sectionOrder: Section[]
  showEducation: boolean
  showSkills: boolean
  showAchievements: boolean
  /** Experience and Projects printed as one "Experience & Projects" section. Missing = two sections. */
  oneSection?: boolean
  /** "Saved Nov 3" or where it came from ("From toolbuilder.tex"). */
  savedLabel: string
  items: SavedCvItem[]
}

/** A job = company + role + its links + the CV saved for it. */
export type JobData = {
  id: string
  company: string
  role: string
  /** "Company · Role", or just the role. */
  label: string
  links: JobLinkData[]
  cv: SavedCv | null
  /** When the Job analysis of this job was last saved (ISO); null = never analyzed. */
  analyzedAt: string | null
}

/** A behavioral question with what you answered, for the read-only panel on Jobs. */
export type BehavioralForJobs = {
  questions: { id: string; position: number; short: string; answers: { en: string; pt: string } }[]
  /** Answers adapted to a job, keyed `${questionId}|${jobId}|${lang}` (lang = en | pt). */
  tailored: Record<string, string>
}

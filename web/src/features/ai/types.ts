import type { BulletKind, Section } from '@prisma/client'

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** One line of "What the AI did" (NEW, REUSED, ORDER, ADDED, LEFT OUT, NOTE). */
export type AiReportLine = { tag: 'NEW' | 'REUSED' | 'ORDER' | 'ADDED' | 'LEFT OUT' | 'NOTE'; text: string }

/**
 * A question the AI asks you instead of inventing a fact. On Job analysis, `experienceId` is the
 * experience it is about: your answer is added to the end of that experience's notes.
 */
export type AiAsk = { id: string; text: string; experienceId?: string | null }

/** What "Generate / Regenerate" proposes for a job's CV. Nothing is saved until you press Save CV. */
export type CvPlan = {
  pages: 1 | 2
  sectionOrder: Section[]
  showEducation: boolean
  showSkills: boolean
  showAchievements: boolean
  items: { section: Section; position: number; versionId: string }[]
  report: AiReportLine[]
  asks: AiAsk[]
}

export type DraftBullet = { kind: BulletKind; text: string; want?: BulletKind | null }

/** A version (or a whole new block) the AI drafted; you keep, edit or discard it. */
export type DraftVersion = {
  blockId: string | null
  newBlock: null | { name: string; section: Section; org: string; location: string; dates: string; stack: string }
  name: string
  title: string
  bullets: DraftBullet[]
  waitingOn: string | null
}

// ---- Added for Job analysis, Behavioral and Experiences (the types above are unchanged) ----

export type RequirementStatus = 'covered' | 'partial' | 'missing'

/** One requirement of the posting and how well the library shows it. */
export type JobRequirement = { text: string; status: RequirementStatus; evidence: string }

/** A drafted version or block on Job analysis, with the line saying what it changed (P2). */
export type AnalysisDraft = DraftVersion & { key: string; blockName: string; note: string }

/** A version the AI would use as it is (P3). */
export type ReusedVersion = { versionId: string; blockName: string; versionName: string; why: string }

/** Everything Job analysis shows after Analyze / Update drafts. Nothing is saved until you press Save. */
export type JobAnalysis = {
  requirements: JobRequirement[]
  asks: AiAsk[]
  drafts: AnalysisDraft[]
  reused: ReusedVersion[]
  report: AiReportLine[]
}

/** A drafted interview answer and what the draft did. */
export type AnswerDraft = { text: string; changes: string[] }

/** Job analysis → Analyze / Update drafts with my answers / Ask for changes. */
export type AnalyzeJobInput = {
  jobId: string
  /** Answers to the AI's gap questions; `answer: null` means "Don't have it". */
  answers?: { id: string; question: string; answer: string | null }[]
  /** "Ask for changes" text, applied to `previousDrafts`. */
  instruction?: string | null
  previousDrafts?: { blockName: string; title: string; bullets: string[] }[]
}

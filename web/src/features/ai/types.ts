import type { BulletKind, Section } from '@prisma/client'

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** One line of "What the AI did" (NEW, REUSED, ORDER, ADDED, LEFT OUT, NOTE). */
export type AiReportLine = { tag: 'NEW' | 'REUSED' | 'ORDER' | 'ADDED' | 'LEFT OUT' | 'NOTE'; text: string }

/**
 * A question the AI asks you instead of inventing a fact. On Job analysis, `experienceId` is the
 * experience it is about: your answer is added to the end of that experience's notes.
 */
export type AiAsk = {
  id: string
  text: string
  experienceId?: string | null
  /** Job analysis: the requirement this question is about (its posting sentence shows as "The job says"). */
  requirementId?: string | null
}

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

/**
 * One requirement of the posting and how well the library shows it. `quotes` are the posting's own
 * sentences, word for word (each one is checked against the saved posting text, P1); `keys` are the words
 * to mark inside them. Both can be empty when the AI could not quote the posting.
 */
export type JobRequirement = {
  id: string
  text: string
  status: RequirementStatus
  evidence: string
  quotes: string[]
  keys: string[]
}

/** The words of a block (each one found in its bullets) that show a requirement; `partly` = only partly. */
export type RequirementMatch = { requirementId: string; phrases: string[]; partly: boolean }

/** A library version written out in full, with its block's meta (blocks used AS IS, blocks left out). */
export type VersionView = {
  versionId: string
  blockId: string
  blockName: string
  versionName: string
  section: Section
  title: string
  org: string
  location: string
  dates: string
  stack: string
  bullets: DraftBullet[]
}

/**
 * A drafted version or block on Job analysis, with the line saying what it changed (P2). The AI drafts it
 * before any answer: `improvedBy` is the question whose answer can fill its gap bullet (a MISSING bullet,
 * never printed). `fromVersionId` is the version it started from ("Update '<name>'" in Save as).
 */
export type AnalysisDraft = DraftVersion & {
  key: string
  blockName: string
  note: string
  fromVersionId: string | null
  fromVersionName: string | null
  improvedBy: string | null
  matches: RequirementMatch[]
}

/** A version the AI would use as it is (P3), written out in full. */
export type ReusedVersion = VersionView & { why: string; matches: RequirementMatch[] }

/** A version the AI left out of this CV, what it would match and why it is out. */
export type LeftOutVersion = VersionView & { why: string; matches: RequirementMatch[] }

export type ProfileKind = 'education' | 'skills' | 'achievement'

/**
 * A profile item (an Education entry, a Technical Skills line, a Leadership & Achievements entry) that shows a
 * requirement, copied from the profile when the analysis ran, with the words that show it (each found in it, P1).
 */
export type ProfileEvidence = {
  requirementId: string
  kind: ProfileKind
  /** Degree, skills label, or achievement title. */
  title: string
  /** Education only: its dates ('' otherwise). */
  dates: string
  /** School · location, the skills, or the achievement's description. */
  detail: string
  phrases: string[]
  partly: boolean
}

/** Everything Job analysis shows after Analyze / Update drafts. Saved with the job as part of the session. */
export type JobAnalysis = {
  requirements: JobRequirement[]
  asks: AiAsk[]
  drafts: AnalysisDraft[]
  reused: ReusedVersion[]
  leftOut: LeftOutVersion[]
  report: AiReportLine[]
  /** Profile items that show requirements. Missing in sessions saved before profiles counted as evidence. */
  profile?: ProfileEvidence[]
  /**
   * The CV's blocks in the order the AI puts them, following his rules (block keys: a library block's id, `new:<name>`
   * for a new block). Missing in sessions saved before the AI ordered blocks: those keep the library order.
   */
  order?: string[]
  /** The role title the AI recommends per experience block of the CV, from the job's role (block key → title). */
  roleTitles?: RoleTitle[]
}

/** A role title the AI recommends for one experience block, taken from the job's role; you decide whether to use it. */
export type RoleTitle = { block: string; title: string }

/**
 * Where one written answer should go in Experiences, as the AI sees it. `experienceId` null with a
 * `newExperienceName` = a place that is not an experience yet; both null = the screen asks.
 */
export type AnswerPlacement = {
  askId: string
  experienceId: string | null
  /** Up to 2 other experiences it could also go to. */
  alsoFits: string[]
  why: string
  newExperienceName: string | null
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

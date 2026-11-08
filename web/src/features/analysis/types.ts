// What Job analysis works with (serializable), plus pure helpers (unit-tested).
import type { LinkKind, Section } from '@prisma/client'
import type { AnalysisDraft, JobAnalysis } from '../ai/types'

export type JobLinkItem = { id: string; kind: LinkKind; url: string }

export type JobSummary = {
  id: string
  company: string
  role: string
  label: string
  links: JobLinkItem[]
  /** Length of the saved posting text (the text itself stays on the server). */
  postingChars: number
}

/** An experience an answer can go to (the "Goes to" picker). */
export type ExperienceOption = { id: string; title: string }

// ---- Job analysis v2: the session saved with the job (Job.analysis), so a reload or "Analyze again" resumes ----

/** Where the pipeline stands: answering, checking the drafts, reviewing the CV, saved. */
export type SessionStep = 'input' | 'drafts' | 'review' | 'saved'

/**
 * An answer sent to Experiences. `entry` is the exact text written to the experience's notes, so a resend
 * replaces only that text. `answer: null` = "I don't have this" (nothing written, `entry` null).
 */
export type SentAnswer = {
  question: string
  answer: string | null
  entry: string | null
  experienceId: string | null
  experienceTitle: string
  isNewExperience: boolean
  resent: boolean
}

/**
 * A draft in "Blocks for this CV". `editedByHand` keeps a redraft from overwriting your edits; `saveAs`
 * is the edit popover's choice: a new version for this job (default) or update the version it came from.
 */
export type SessionDraft = AnalysisDraft & { keep: boolean; editedByHand: boolean; saveAs: 'new' | 'update' }

export const SESSION_VERSION = 2

/** Everything the pipeline needs to resume where you stopped. Validated on save and on load. */
export type AnalysisSession = {
  v: typeof SESSION_VERSION
  analysis: JobAnalysis
  /** Typed answers and "I don't have this", by question id. */
  answers: Record<string, string>
  dont: Record<string, boolean>
  /** Answers already sent to Experiences, by question id. */
  sent: Record<string, SentAnswer>
  drafts: SessionDraft[]
  /** Versions used AS IS that you left out of this CV (×). */
  asIsOut: string[]
  pages: 1 | 2
  step: SessionStep
  analyzedAt: string
  savedAt: string | null
  /**
   * "Role titles for this job": the title picked per experience block, by block key. A block with no entry keeps the
   * title it has (no title changes without you choosing). Missing in sessions saved before role titles.
   */
  titles?: Record<string, TitleChoice>
  /** How you arranged the CV on review (order, swaps, sections). Missing = as the AI gave it, in two sections. */
  arrangement?: Arrangement
}

/**
 * The review CV as you arranged it; nothing here changes the library (a block's own section stays). Block keys as in
 * `block-key.ts`. Every field is optional: what is missing follows the AI.
 */
export type Arrangement = {
  /** Every block of the CV in your order, as one list (two sections split it, keeping it). Missing = the AI's order. */
  order?: string[]
  /** Versions the AI left out (`analysis.leftOut`) that you swapped into this CV, by version id. */
  swappedIn?: string[]
  /** Blocks you swapped out of this CV, by block key. */
  swappedOut?: string[]
  /** The section a block is in on this CV, when you moved it (block key → section). */
  sections?: Record<string, Section>
  /** Experience and Projects printed as one "Experience & Projects" section. */
  oneSection?: boolean
}

/** "AI recommends" (the job's title), "You have" (the version's title) or "Write my own" (`own`). */
export type TitlePick = 'ai' | 'mine' | 'own'
export type TitleChoice = { pick: TitlePick; own: string }

export const STEP_NAMES = ['Read posting', 'Compare with blocks', 'Your input', 'Drafts', 'Review & save'] as const

const APPLICATION_HOSTS = [
  'gupy.io',
  'greenhouse.io',
  'lever.co',
  'workable.com',
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'ashbyhq.com',
  'kenoby.com',
  'solides.jobs',
  'recruitee.com',
  'bamboohr.com',
  'teamtailor.com',
  'breezy.hr',
  'jobvite.com',
  'icims.com',
  'amazon.jobs',
  'inhire.app',
]

/** Job boards are postings; application systems (Gupy, Greenhouse…) are applications. Unknown sites count as postings here. */
export function guessLinkKind(url: string): LinkKind {
  let host = ''
  try {
    host = new URL(/^[a-z]+:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return 'OTHER'
  }
  if (APPLICATION_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'APPLICATION'
  return 'POSTING'
}

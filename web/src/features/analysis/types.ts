// What Job analysis works with (serializable), plus pure helpers (unit-tested).
import type { LinkKind } from '@prisma/client'
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

export type ReadResult = { url: string; ok: boolean; title: string | null; message: string | null }

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
}

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

// What Job analysis works with (serializable), plus pure helpers (unit-tested).
import type { LinkKind } from '@prisma/client'
import type { AiAsk, AnalysisDraft, JobAnalysis } from '../ai/types'

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

export type MadeDraft = AnalysisDraft & { keep: boolean; editing: boolean }

export type Phase = 'idle' | 'reading' | 'analyzing' | 'saving'

/** An experience a gap answer can go to ("Adds to" under each question). */
export type ExperienceOption = { id: string; title: string }

/** Where an answer was added in Experiences, and the exact text added. */
export type FiledAnswer = { answer: string; experienceId: string; title: string }

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

/**
 * Where a question's answer goes: your pick, else the experience the AI named, else `fallback`: the id of
 * "Answers to the AI's questions" when it exists, or "" (the server creates it).
 */
export function destinationOf(ask: AiAsk, picked: Record<string, string>, fallback = ''): string {
  return picked[ask.id] ?? ask.experienceId ?? fallback
}

/** Answers to add to Experiences now: written, not "Don't have it", and not already added word for word. */
export function answersToFile(
  asks: AiAsk[],
  answers: Record<string, string>,
  noAnswer: Record<string, boolean>,
  filed: Record<string, FiledAnswer>,
): { ask: AiAsk; answer: string }[] {
  return asks
    .map((ask) => ({ ask, answer: (answers[ask.id] ?? '').trim() }))
    .filter(({ ask, answer }) => answer && !noAnswer[ask.id] && filed[ask.id]?.answer !== answer)
}

export const STEP_NAMES = ['Read posting', 'Compare with blocks', 'Your input', 'Drafts', 'Review & save'] as const

/** Which step is current: reading 0, comparing 1, waiting for answers 2, drafting again 3, reviewing 4; 5 = all done. */
export function currentStep(state: { phase: Phase; analysis: JobAnalysis | null; openAsks: number; saved: boolean; redrafting: boolean }): number {
  if (state.saved) return STEP_NAMES.length
  if (state.phase === 'reading') return 0
  if (state.phase === 'analyzing') return state.redrafting ? 3 : 1
  if (!state.analysis) return 0
  return state.openAsks > 0 ? 2 : 4
}

/** Links typed or pasted into the box: split on spaces, commas or new lines; duplicates dropped. */
export function parseUrls(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter((u) => u && !seen.has(u) && seen.add(u))
}

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

/** "2 new versions · 1 new block (waiting)". */
export function madeSummary(made: MadeDraft[]): string {
  const versions = made.filter((m) => m.blockId).length
  const blocks = made.filter((m) => !m.blockId).length
  const waiting = made.filter((m) => m.waitingOn).length
  const parts = [
    versions ? `${versions} new ${versions === 1 ? 'version' : 'versions'}` : '',
    blocks ? `${blocks} new ${blocks === 1 ? 'block' : 'blocks'}${waiting ? ' (waiting)' : ''}` : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'Nothing yet'
}

/** Drafts the Save button would store: kept and not waiting on a question. */
export function toSave(made: MadeDraft[]): MadeDraft[] {
  return made.filter((m) => m.keep && !m.waitingOn)
}

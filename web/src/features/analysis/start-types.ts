// What the v2 start returns (startFromPosting, continueFromLinks, startPickedJob), and the pure helpers behind it.
// Not a 'use server' file, so plain functions and types can live here.
import type { JobSummary } from './types'

export type UnreadLink = { url: string; error: string }
export type StartedJob = { kind: 'job'; job: JobSummary; existed: boolean; postingText: string; unread: UnreadLink[] }

/** One job of a split, as the "Which job?" card shows it. `text` is that job's own text (saved only once picked). */
export type SplitCandidate = {
  id: string
  company: string
  role: string
  meta: string
  lines: string[]
  requirementCount: number
  text: string
  /** One track of a single posting: its text keeps the posting's shared part. */
  track: boolean
  /** The line its own section starts with, word for word ('' when unknown). */
  startsWith: string
  /** Tracks: headings of the shared part kept in each track, each found word for word. */
  shared: string[]
}

/** Where the text came from, for the "Which job?" heading: one link, several links, or pasted text. */
export type StartSource = 'link' | 'links' | 'text'

/** What was read holds more than one job: nothing is created; the user picks one (startPickedJob). */
export type SplitJobs = { kind: 'split'; candidates: SplitCandidate[]; urls: string[]; unread: UnreadLink[]; source: StartSource }

/** One link that was read, with its text, sent back by the client when the user answers the overlap question. */
export type ReadLink = { url: string; text: string }

/**
 * Two or more links whose texts repeat each other: nothing is asked of the AI yet; the user says "Same job" or
 * "Different jobs" (continueFromLinks). `links` are the texts read, so the pages are not read again.
 */
export type OverlapLinks = { kind: 'overlap'; links: ReadLink[]; share: number; urls: string[]; unread: UnreadLink[]; title: string | null }

export type StartResult = StartedJob | SplitJobs | OverlapLinks

export type CandidateSource = {
  company: string
  role: string
  location: string
  kind: string
  text: string
  lines: string[]
  requirementCount: number
  track?: boolean
  startsWith?: string
  shared?: string[]
}

/** The card of one job in "Which job?": nothing about it is saved yet. */
export const toCandidate = (job: CandidateSource, index: number): SplitCandidate => ({
  id: `c${index + 1}`,
  company: job.company,
  role: job.role,
  meta: [job.company, job.location, job.kind].filter(Boolean).join(' · '),
  lines: job.lines,
  requirementCount: job.requirementCount,
  text: job.text,
  track: job.track ?? false,
  startsWith: job.startsWith ?? '',
  shared: job.shared ?? [],
})

/** "From <url>:" before each text, as the links of different jobs are read together. */
export const joinLinkTexts = (links: readonly ReadLink[]): string => (links.length === 1 ? links[0].text : links.map((l) => `From ${l.url}:\n${l.text}`).join('\n\n'))

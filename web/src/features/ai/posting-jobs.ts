// The jobs the AI found in what was read, made safe to use. Pure and server-agnostic.
// P1 (drop, never invent): a job is kept only when the lines the AI says begin and end it really are in the text,
// in order; each job's own text is cut out of the real text, never taken from the AI.
// Tracks (one posting, e.g. an internship program, with several tracks that each list their own requirements):
// each track's text is the posting without the OTHER tracks' sections, so it keeps the shared part (intro,
// general requirements, benefits, selection process) around its own section.
import { findWording, prepareText } from './postprocess'
import type { PostingJobsOutput } from './schemas'

const MAX_COMPANY = 120
const MAX_ROLE = 160
const MAX_META = 80
/** A shared introduction (the company's blurb) is added to each job only when it is short. */
const MAX_INTRO_CHARS = 3_000
/** The most of a posting's shared part a track keeps (what comes first is kept first). */
const MAX_SHARED_CHARS = 12_000
/** The most a job's text can be: what a job's posting text is allowed to hold. */
const MAX_JOB_TEXT_CHARS = 40_000
const MAX_LINES = 2
const MIN_LINE_CHARS = 12
const MAX_HEADINGS = 8
const MAX_HEADING_CHARS = 80
const MIN_HEADING_CHARS = 3

export type PostingJob = {
  company: string
  role: string
  location: string
  kind: string
  /** This job's own text (shared intro, or a track's shared part, included), from the real posting. */
  text: string
  /** Up to 2 sentences of `text`, in its own wording. */
  lines: string[]
  requirementCount: number
  /** One track of a single posting (not a separate posting). */
  track: boolean
  /** The line its own section starts with, as the posting writes it ('' when the whole text is one job). */
  startsWith: string
  /** Tracks only: headings of the shared part each track keeps, each found word for word in it. */
  shared: string[]
}

type RawJob = PostingJobsOutput['jobs'][number]
/** What the AI returned; the track fields may be missing (older callers and tests). */
export type PostingJobsInput = {
  jobs: (Omit<RawJob, 'isTrack' | 'moreSections'> & { isTrack?: boolean; moreSections?: RawJob['moreSections'] })[]
  sharedHeadings?: string[]
}
type InputJob = PostingJobsInput['jobs'][number]

const tidy = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max).trim()
const count = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0)
const unique = (items: string[]): string[] => items.filter((s, i) => items.indexOf(s) === i)

const validLines = (lines: string[], text: string): string[] => {
  const prepared = prepareText(text)
  const found = lines.map((l) => findWording(prepared, l, { minChars: MIN_LINE_CHARS })).filter((l): l is string => l !== null)
  return unique(found).slice(0, MAX_LINES)
}

/** "Trilha AI Builder", "Trilha de AI Builder", "Track: AI Builder" → "AI Builder" (a track's role is its short title). */
const TRACK_WORD = /^(?:trilha(?:\s+de)?|track)\b\s*[:\-–—]?\s*/i
const trackRole = (role: string): string => role.replace(TRACK_WORD, '').trim() || role

const describe = (raw: InputJob) => ({
  company: tidy(raw.company, MAX_COMPANY),
  role: raw.isTrack === true ? trackRole(tidy(raw.role, MAX_ROLE)) : tidy(raw.role, MAX_ROLE),
  location: tidy(raw.location, MAX_META),
  kind: tidy(raw.kind, MAX_META),
  requirementCount: count(raw.requirementCount),
})

type Prepared = ReturnType<typeof prepareText>
/** A part of the posting: raw character offsets [start, end). */
type Range = { start: number; end: number }
/** `normEnd`: where the part ends in the normalized text (searches go on from there). */
type Found = Range & { raw: InputJob; normEnd: number }

const norm = (line: string): string => prepareText(line).norm.trim()
const overlaps = (taken: readonly Range[], r: Range): boolean => taken.some((t) => r.start < t.end && t.start < r.end)

/** Where each job sits in the text (raw character offsets), in order and never overlapping. */
function locate(jobs: InputJob[], posting: Prepared): Found[] {
  const found: Found[] = []
  let cursor = 0 // in normalized text: the end of the previous job
  for (const raw of jobs) {
    if (!tidy(raw.role, MAX_ROLE)) continue
    const first = norm(raw.firstLine)
    const last = norm(raw.lastLine)
    if (!first || !last) continue
    const at = posting.norm.indexOf(first, cursor)
    if (at < 0) continue
    const lastAt = posting.norm.indexOf(last, at)
    if (lastAt < 0) continue
    const end = lastAt + last.length
    found.push({ raw, start: posting.map[at], end: posting.map[end - 1] + 1, normEnd: end })
    cursor = end
  }
  return found
}

/** True when only spaces stand between `index` and the start of its line. */
function atLineStart(raw: string, index: number): boolean {
  let i = index - 1
  while (i >= 0 && (raw[i] === ' ' || raw[i] === '\t')) i -= 1
  return i < 0 || raw[i] === '\n'
}

/**
 * One more part of a track: the first line must start a line of the posting (so "AI Engineer" is not found inside
 * "Trilha AI Engineer"), after `from`, and the part must not overlap any part already taken.
 */
function findPart(posting: Prepared, part: { firstLine: string; lastLine: string }, from: number, taken: readonly Range[]): Range & { normEnd: number } | null {
  const first = norm(part.firstLine)
  const last = norm(part.lastLine)
  if (!first || !last) return null
  for (let at = posting.norm.indexOf(first, from); at >= 0; at = posting.norm.indexOf(first, at + 1)) {
    const start = posting.map[at]
    if (!atLineStart(posting.raw, start)) continue
    const lastAt = posting.norm.indexOf(last, at)
    if (lastAt < 0) return null
    const normEnd = lastAt + last.length
    const range = { start, end: posting.map[normEnd - 1] + 1 }
    if (!overlaps(taken, range)) return { ...range, normEnd }
  }
  return null
}

/** Every track's parts: its first part, then the other parts the AI named that check out, in the posting's order. */
function trackParts(located: Found[], posting: Prepared): Range[][] {
  const taken: Range[] = located.map(({ start, end }) => ({ start, end }))
  return located.map((track) => {
    const parts: Range[] = [{ start: track.start, end: track.end }]
    let cursor = track.normEnd
    for (const more of track.raw.moreSections ?? []) {
      const found = findPart(posting, more, cursor, taken)
      if (!found) continue
      parts.push({ start: found.start, end: found.end })
      taken.push({ start: found.start, end: found.end })
      cursor = found.normEnd
    }
    return parts.sort((a, b) => a.start - b.start)
  })
}

/** The line a job starts with, in the posting's own wording. */
const startLine = (text: string, start: number): string => tidy(text.slice(start).split('\n')[0] ?? '', MAX_ROLE)

/** The pieces of `text` outside every range, trimmed, in order, each tagged with where it sits. */
function sharedPieces(text: string, ranges: readonly Range[]): { at: number; text: string }[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const bounds = [{ end: 0 }, ...sorted.map((r) => ({ end: r.end }))]
  return bounds
    .map((b, i) => ({ at: b.end, text: text.slice(b.end, sorted[i]?.start ?? text.length).trim() }))
    .filter((p) => p.text)
}

/** Shared pieces kept in order until MAX_SHARED_CHARS; the piece that crosses the limit is cut there. */
function capShared(pieces: { at: number; text: string }[]): { at: number; text: string }[] {
  let room = MAX_SHARED_CHARS
  const kept: { at: number; text: string }[] = []
  for (const p of pieces) {
    if (room <= 0) break
    kept.push({ at: p.at, text: p.text.slice(0, room).trim() })
    room -= p.text.length
  }
  return kept.filter((p) => p.text)
}

/** Headings the AI named that really are in the shared part, in its own wording. */
function validHeadings(headings: string[], shared: string): string[] {
  const prepared = prepareText(shared)
  const found = headings
    .map((h) => tidy(h, MAX_HEADING_CHARS))
    .map((h) => findWording(prepared, h, { minChars: MIN_HEADING_CHARS, wholeWords: true }))
    .filter((h): h is string => h !== null)
  return unique(found).slice(0, MAX_HEADINGS)
}

/**
 * Each track's text: the shared part (everything outside every track's parts, capped) and its own parts, in the
 * posting's order. The other tracks' parts are left out.
 */
function tracks(located: Found[], posting: Prepared, headings: string[]): PostingJob[] {
  const postingText = posting.raw
  const parts = trackParts(located, posting)
  const pieces = sharedPieces(postingText, parts.flat())
  const shared = capShared(pieces)
  const sharedHeadings = validHeadings(headings, pieces.map((p) => p.text).join('\n\n'))
  return located.map(({ raw, start }, i) => {
    const own = parts[i].map((r) => ({ at: r.start, text: postingText.slice(r.start, r.end).trim() }))
    const text = [...shared, ...own]
      .sort((a, b) => a.at - b.at)
      .map((p) => p.text)
      .join('\n\n')
      .slice(0, MAX_JOB_TEXT_CHARS)
    return { ...describe(raw), text, lines: validLines(raw.lines, text), track: true, startsWith: startLine(postingText, start), shared: sharedHeadings }
  })
}

/**
 * The jobs of `postingText`, from what the AI returned. Two or more jobs whose anchors check out: each with its
 * own text (tracks of one posting: with the shared part). Anything less: ONE job with the whole text, named from the
 * first job that checked out (else the AI's first entry, else empty names).
 */
export function finalizePostingJobs(raw: PostingJobsInput, postingText: string): PostingJob[] {
  const posting = prepareText(postingText)
  const located = locate(raw.jobs, posting)
  if (located.length < 2) {
    const named = located[0]?.raw ?? raw.jobs[0]
    return [
      {
        ...(named ? describe(named) : { company: '', role: '', location: '', kind: '', requirementCount: 0 }),
        text: postingText,
        lines: named ? validLines(named.lines, postingText) : [],
        track: false,
        startsWith: '',
        shared: [],
      },
    ]
  }
  if (located.every((f) => f.raw.isTrack === true)) return tracks(located, posting, raw.sharedHeadings ?? [])
  const intro = postingText.slice(0, located[0].start).trim()
  const prefix = intro && intro.length < MAX_INTRO_CHARS ? `${intro}\n\n` : ''
  return located.map(({ raw: job, start, end }) => {
    const text = `${prefix}${postingText.slice(start, end)}`.slice(0, MAX_JOB_TEXT_CHARS)
    return { ...describe(job), text, lines: validLines(job.lines, text), track: false, startsWith: startLine(postingText, start), shared: [] }
  })
}

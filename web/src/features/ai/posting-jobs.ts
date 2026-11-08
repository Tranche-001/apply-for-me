// The jobs the AI found in what was read, made safe to use. Pure and server-agnostic.
// P1 (drop, never invent): a job is kept only when the lines the AI says begin and end it really are in the text,
// in order; each job's own text is cut out of the real text, never taken from the AI.
import { findWording, prepareText } from './postprocess'
import type { PostingJobsOutput } from './schemas'

const MAX_COMPANY = 120
const MAX_ROLE = 160
const MAX_META = 80
/** A shared introduction (the company's blurb) is added to each job only when it is short. */
const MAX_INTRO_CHARS = 3_000
/** The most a job's text can be: what a job's posting text is allowed to hold. */
const MAX_JOB_TEXT_CHARS = 40_000
const MAX_LINES = 2
const MIN_LINE_CHARS = 12

export type PostingJob = {
  company: string
  role: string
  location: string
  kind: string
  /** This job's own text (shared intro first), from the real posting. */
  text: string
  /** Up to 2 sentences of `text`, in its own wording. */
  lines: string[]
  requirementCount: number
}

type RawJob = PostingJobsOutput['jobs'][number]

const tidy = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max).trim()
const count = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0)

const validLines = (lines: string[], text: string): string[] => {
  const prepared = prepareText(text)
  const found = lines.map((l) => findWording(prepared, l, { minChars: MIN_LINE_CHARS })).filter((l): l is string => l !== null)
  return found.filter((l, i) => found.indexOf(l) === i).slice(0, MAX_LINES)
}

const describe = (raw: RawJob) => ({
  company: tidy(raw.company, MAX_COMPANY),
  role: tidy(raw.role, MAX_ROLE),
  location: tidy(raw.location, MAX_META),
  kind: tidy(raw.kind, MAX_META),
  requirementCount: count(raw.requirementCount),
})

type Found = { raw: RawJob; start: number; end: number }

/** Where each job sits in the text (raw character offsets), in order and never overlapping. */
function locate(jobs: RawJob[], posting: ReturnType<typeof prepareText>): Found[] {
  const found: Found[] = []
  let cursor = 0 // in normalized text: the end of the previous job
  for (const raw of jobs) {
    if (!tidy(raw.role, MAX_ROLE)) continue
    const first = prepareText(raw.firstLine).norm.trim()
    const last = prepareText(raw.lastLine).norm.trim()
    if (!first || !last) continue
    const at = posting.norm.indexOf(first, cursor)
    if (at < 0) continue
    const lastAt = posting.norm.indexOf(last, at)
    if (lastAt < 0) continue
    const end = lastAt + last.length
    found.push({ raw, start: posting.map[at], end: posting.map[end - 1] + 1 })
    cursor = end
  }
  return found
}

/**
 * The jobs of `postingText`, from what the AI returned. Two or more jobs whose anchors check out: each with its
 * own text. Anything less: ONE job with the whole text, named from the first job that checked out (else the AI's
 * first entry, else empty names).
 */
export function finalizePostingJobs(raw: PostingJobsOutput, postingText: string): PostingJob[] {
  const posting = prepareText(postingText)
  const located = locate(raw.jobs, posting)
  if (located.length < 2) {
    const named = located[0]?.raw ?? raw.jobs[0]
    return [
      {
        ...(named ? describe(named) : { company: '', role: '', location: '', kind: '', requirementCount: 0 }),
        text: postingText,
        lines: named ? validLines(named.lines, postingText) : [],
      },
    ]
  }
  const intro = postingText.slice(0, located[0].start).trim()
  const prefix = intro && intro.length < MAX_INTRO_CHARS ? `${intro}\n\n` : ''
  return located.map(({ raw: job, start, end }) => {
    const text = `${prefix}${postingText.slice(start, end)}`.slice(0, MAX_JOB_TEXT_CHARS)
    return { ...describe(job), text, lines: validLines(job.lines, text) }
  })
}

'use server'

// Job analysis writes: start from a posting (link or pasted text), autosave the session, save the CV with the
// drafts you kept, add an experience for a requirement that is not met, rename a job. Every input is validated;
// every success refreshes the route, except the autosave.
import { Prisma } from '@prisma/client'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { draftBlockFromExperience, readPostingJobs } from '../ai/actions'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { jobNamesFrom, type JobNames } from '../ai/job-info'
import { jobLabel } from '../ai/labels'
import { saveDraftToLibrary, updateVersionFromDraft, type SavedDraft } from '../ai/library-writes'
import { fail, invalidInput, ok, type ActionResult } from '../ai/result'
import type { AnalysisDraft } from '../ai/types'
import { sectionSchema } from '../blocks/schemas'
import { UserError } from '../cv/action-result'
import { writeCv } from '../cv/write-cv'
import { appendAnswerToExperience, type PlacedAnswer } from '../experiences/answers'
import { answerEntry } from '../experiences/types'
import { draftVersionId } from './cv-draft'
import { keptDraftInput, mapCvItems, updatesVersion } from './cv-save'
import { MAX_POSTING_CHARS } from './html-text'
import { toJobSummary } from './job-summary'
import { readPostingUrls } from './read-posting'
import { analysisDraftForRequirement } from './requirement-draft'
import { analysisSessionSchema, MAX_SESSION_CHARS } from './session'
import { keepOneCopy, sameJobShare } from './overlap'
import { joinLinkTexts, toCandidate, type StartedJob, type StartResult, type StartSource, type UnreadLink } from './start-types'
import { guessLinkKind } from './types'
import { checkUrl } from './url-guard'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')
const names = z.object({
  company: z.string().trim().max(120, 'Company is too long (120 characters at most).'),
  role: z.string().trim().min(1, 'Give the job a role, e.g. “Backend Engineer”.').max(160, 'Role is too long (160 characters at most).'),
})

async function attempt<T>(what: string, work: () => Promise<ActionResult<T>>, duplicate?: string, refreshOnSuccess = true): Promise<ActionResult<T>> {
  let result: ActionResult<T>
  try {
    result = await work()
  } catch (err) {
    if (err instanceof UserError) return fail(err.message)
    console.error(`[analysis] ${what} failed`, dbLogContext(err))
    return fail(plainDbError(err, duplicate))
  }
  // Outside the try: a write that is committed is never reported as failed because the refresh threw.
  if (result.ok && refreshOnSuccess) {
    try {
      refresh()
    } catch (err) {
      console.error(`[analysis] ${what}: refresh failed`, dbLogContext(err))
    }
  }
  return result
}

/** Prisma's "unique constraint failed" (two requests created the same row). */
const isUniqueViolation = (err: unknown): boolean => typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002'

/** Interactive transactions that do several writes: room to finish, and to wait for a connection. */
const TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 } as const

/** Rename a job. Versions made for it that carry its old name take the new one (decision log). */
export async function renameJob(input: { jobId: string; company: string; role: string }): Promise<ActionResult<{ label: string; renamedVersions: number }>> {
  const parsed = names.extend({ jobId: id }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, company, role } = parsed.data
  const label = jobLabel({ company, role })
  return attempt(
    'renameJob',
    () =>
      db.$transaction(async (tx) => {
        const job = await tx.job.findUnique({ where: { id: jobId }, include: { versions: { include: { version: { select: { id: true, name: true, blockId: true } } } } } })
        if (!job) return fail<{ label: string; renamedVersions: number }>('This job no longer exists. Reload the page.')
        const oldLabel = jobLabel(job)
        await tx.job.update({ where: { id: jobId }, data: { company, role } })
        let renamedVersions = 0
        for (const { version } of job.versions) {
          if (version.name !== oldLabel || oldLabel === label) continue
          const clash = await tx.version.findUnique({ where: { blockId_name: { blockId: version.blockId, name: label } }, select: { id: true } })
          if (clash) continue
          await tx.version.update({ where: { id: version.id }, data: { name: label } })
          renamedVersions += 1
        }
        return ok({ label, renamedVersions })
      }),
    `You already have a job called “${label}”. Pick another name, or open that one.`,
  )
}

// ---------- Job analysis v2 ----------

const MISSING_JOB = 'This job no longer exists. Reload the page.'
const gone = () => Object.assign(new Error('gone'), { code: 'P2025' })

const urlInput = z.string().trim().min(1, 'Paste a link to the job posting.').max(2048, 'That link is too long.')
const pastedInput = z
  .string()
  .trim()
  .min(80, 'Paste the whole posting: what you pasted is too short to analyze.')
  .max(MAX_POSTING_CHARS, `That is too long (${MAX_POSTING_CHARS.toLocaleString('en')} characters at most). Paste only the posting.`)

export type { OverlapLinks, SplitCandidate, SplitJobs, StartedJob, StartResult, UnreadLink } from './start-types'

const MAX_START_LINKS = 5
const startUrls = z
  .array(urlInput.or(z.literal('')))
  .transform((list) => list.filter(Boolean))
  .pipe(z.array(urlInput).min(1, 'Paste a link to the job posting.').max(MAX_START_LINKS, `Up to ${MAX_START_LINKS} links per job.`))
const startInput = z.union([z.object({ urls: z.array(z.string()) }), z.object({ url: z.string() }), z.object({ text: z.string() })])

/**
 * The v2 start: read the posting (from one or more links of the same job, or the pasted text), let the AI name the
 * company and role, then find the job with that exact pair (`existed: true`) or create it. The posting text is saved
 * on the job; every valid link typed is added to it (read or not) unless the job already has it. Links that could
 * not be read come back in `unread`.
 */
export async function startFromPosting(input: { urls: string[] } | { url: string } | { text: string }): Promise<ActionResult<StartResult>> {
  const parsedInput = startInput.safeParse(input)
  if (!parsedInput.success) return fail('Paste a link to the job posting, or the job text.')
  const data = parsedInput.data
  if ('text' in data) {
    const parsedText = pastedInput.safeParse(data.text)
    if (!parsedText.success) return fail(invalidInput(parsedText.error))
    return startFromText({ postingText: parsedText.data, urls: [], unread: [], title: null, source: 'text' })
  }
  const parsedUrls = startUrls.safeParse('urls' in data ? data.urls : [data.url])
  if (!parsedUrls.success) return fail(invalidInput(parsedUrls.error))
  const read = await readPostingUrls(parsedUrls.data)
  if (!read.ok) return fail(read.error)
  const { text: postingText, urls, unread, title, reads } = read
  // Links whose texts repeat each other: the user says whether they are the same job before the AI is asked.
  const share = sameJobShare(reads)
  if (share !== null) return ok<StartResult>({ kind: 'overlap', links: reads, share, urls, unread, title })
  return startFromText({ postingText, urls, unread, title, source: reads.length > 1 ? 'links' : 'link' })
}

const readLinkInput = z.object({
  url: urlInput,
  text: z.string().trim().min(1, 'A link came back with no text. Read the links again.').max(MAX_POSTING_CHARS, 'A link’s text is too long. Read the links again.'),
})
const continueInput = z.object({
  same: z.boolean(),
  links: z.array(readLinkInput).min(2, 'Read at least two links first.').max(MAX_START_LINKS, `Up to ${MAX_START_LINKS} links per job.`),
  urls: z.array(urlInput).max(MAX_START_LINKS, `Up to ${MAX_START_LINKS} links per job.`),
  title: z.string().trim().max(300).nullable(),
})

/** Each link checked again (public http/https only) and normalized; null when one is refused. */
function checkedUrls(raws: string[]): { ok: true; urls: string[] } | { ok: false; error: string } {
  const urls: string[] = []
  for (const raw of raws) {
    const check = checkUrl(raw)
    if (!check.ok) return { ok: false, error: `${raw}: ${check.error}` }
    const url = check.url.toString()
    if (!urls.includes(url)) urls.push(url)
  }
  return { ok: true, urls }
}

/**
 * The answer to "These links look like the same job": the texts already read come back from the screen (no page is
 * read again), checked for size, and every link must be one of the job's links. Same job: one copy of the text (the
 * longest). Different jobs: the texts stay apart. Then the AI says which jobs or tracks it holds, as in startFromPosting.
 */
export async function continueFromLinks(input: { same: boolean; links: { url: string; text: string }[]; urls: string[]; title: string | null }): Promise<ActionResult<StartResult>> {
  const parsed = continueInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { same, title } = parsed.data
  const all = checkedUrls(parsed.data.urls)
  if (!all.ok) return fail(all.error)
  const read = checkedUrls(parsed.data.links.map((l) => l.url))
  if (!read.ok) return fail(read.error)
  if (read.urls.some((u) => !all.urls.includes(u))) return fail('A link is not one of the links typed. Read the links again.')
  const links = parsed.data.links.map((l, i) => ({ url: read.urls[i] ?? l.url, text: l.text }))
  const postingText = (same ? keepOneCopy(links) : joinLinkTexts(links)).slice(0, MAX_POSTING_CHARS)
  return startFromText({ postingText, urls: all.urls, unread: [], title, source: same ? 'link' : 'links' })
}

type TextStart = { postingText: string; urls: string[]; unread: UnreadLink[]; title: string | null; source: StartSource }

/** The AI says which jobs (or tracks) the text holds: one is started right away, more go to "Which job?". */
async function startFromText({ postingText, urls, unread, title, source }: TextStart): Promise<ActionResult<StartResult>> {
  const found = await readPostingJobs({ postingText })
  if (!found.ok) return fail(found.error)
  const [only, ...others] = found.data
  if (others.length) return ok<StartResult>({ kind: 'split', candidates: found.data.map(toCandidate), urls, unread, source })
  const names = jobNamesFrom(only, title)
  if (!names) return fail('Couldn’t tell which job this is. Check that it is the whole posting, or paste the job text.')
  return saveStartedJob('startFromPosting', { names, postingText, urls, unread })
}

/**
 * Find the job with this exact company and role (`existed: true`) or create it, save the posting text, and add the
 * links it does not have yet. A different posting text clears the saved session: it quotes the old text.
 */
function saveStartedJob(what: string, { names, postingText, urls, unread }: { names: JobNames; postingText: string; urls: string[]; unread: UnreadLink[] }): Promise<ActionResult<StartedJob>> {
  return attempt<StartedJob>(what, async () => {
    const include = { links: { orderBy: { position: 'asc' as const } } }
    const newLinks = (known: { url: string; position: number }[]) => {
      const first = known.reduce((max, l) => Math.max(max, l.position), -1) + 1
      return urls.filter((u) => !known.some((l) => l.url === u)).map((url, i) => ({ url, kind: guessLinkKind(url), position: first + i }))
    }
    const reuse = (existing: { id: string; postingText: string; links: { url: string; position: number }[] }) => {
      const links = newLinks(existing.links)
      // A different posting text: the saved session quotes the old one, so it goes (old quotes never point at text that is gone).
      const staleSession = existing.postingText !== postingText ? { analysis: Prisma.DbNull, analyzedAt: null } : {}
      return db.job.update({
        where: { id: existing.id },
        data: { postingText, ...staleSession, ...(links.length ? { links: { create: links } } : {}) },
        include,
      })
    }
    const started = (job: Parameters<typeof toJobSummary>[0], existed: boolean) => ok<StartedJob>({ kind: 'job', job: toJobSummary(job), existed, postingText, unread })
    const existing = await db.job.findUnique({ where: { company_role: names }, include })
    if (existing) return started(await reuse(existing), true)
    const links = newLinks([])
    try {
      const created = await db.job.create({ data: { ...names, postingText, ...(links.length ? { links: { create: links } } : {}) }, include })
      return started(created, false)
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      // Another request created the same job between the read and the create: use that one.
      const raced = await db.job.findUnique({ where: { company_role: names }, include })
      if (!raced) throw err
      return started(await reuse(raced), true)
    }
  })
}

const pickedInput = names.extend({
  text: pastedInput,
  urls: z.array(z.string().trim().max(2048, 'That link is too long.')).max(MAX_START_LINKS, `Up to ${MAX_START_LINKS} links per job.`),
})

/**
 * "Which job?" → "Analyze this job": the job the user picked from a split. Same write as startFromPosting (find the
 * job by company and role or create it, save the picked text, add the links); nothing is read or asked of the AI.
 */
export async function startPickedJob(input: { company: string; role: string; text: string; urls: string[] }): Promise<ActionResult<StartedJob>> {
  const parsed = pickedInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { company, role, text, urls: typed } = parsed.data
  const urls: string[] = []
  for (const raw of typed.filter(Boolean)) {
    const check = checkUrl(raw)
    if (!check.ok) return fail(`${raw}: ${check.error}`)
    const url = check.url.toString()
    if (!urls.includes(url)) urls.push(url)
  }
  return saveStartedJob('startPickedJob', { names: { company, role }, postingText: text, urls, unread: [] })
}

const sessionInput = z.object({ jobId: id, session: z.unknown() })

/**
 * Autosave of the session (Job.analysis). It validates the whole session and stores only what the schema knows.
 * It does NOT call refresh(): this runs after pauses in typing, and a refresh would re-render the route
 * every time. The screen already holds the state it just saved.
 */
export async function saveAnalysisSession(input: { jobId: string; session: unknown }): Promise<ActionResult<null>> {
  const parsed = sessionInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const session = analysisSessionSchema.safeParse(parsed.data.session)
  if (!session.success) return fail(`The analysis couldn’t be saved: ${invalidInput(session.error)}`)
  if (JSON.stringify(session.data).length > MAX_SESSION_CHARS) return fail('The analysis is too big to save.')
  const analyzedAt = new Date(session.data.analyzedAt)
  if (Number.isNaN(analyzedAt.getTime())) return fail('The analysis couldn’t be saved: its date is not valid.')
  const { jobId } = parsed.data
  return attempt(
    'saveAnalysisSession',
    async () => {
      // select: only analyzedAt comes back, so the saved JSON is not echoed on every autosave.
      await db.job.update({ where: { id: jobId }, data: { analysis: session.data as unknown as Prisma.InputJsonValue, analyzedAt }, select: { analyzedAt: true } })
      return ok(null)
    },
    undefined,
    false,
  )
}

const MAX_CV_ITEMS = 200
const cvInput = z.object({
  pages: z.union([z.literal(1), z.literal(2)]),
  sectionOrder: z.array(sectionSchema).min(1).max(2),
  showEducation: z.boolean(),
  showSkills: z.boolean(),
  showAchievements: z.boolean(),
  items: z
    .array(z.object({ section: sectionSchema, position: z.number().int().min(0).max(MAX_CV_ITEMS), versionId: z.string().trim().min(1).max(100) }))
    .max(MAX_CV_ITEMS),
})
const saveCvInput = z.object({
  jobId: id,
  drafts: z
    .array(keptDraftInput)
    .max(20, 'Keep at most 20 drafts.')
    .refine((drafts) => new Set(drafts.map((d) => d.key)).size === drafts.length, { message: 'Two drafts have the same key. Reload the page and try again.' }),
  cv: cvInput,
})

export type SavedAnalysisCv = { saved: SavedDraft[]; savedLabel: string; idMap: Record<string, string> }

/**
 * Save on the review step, in ONE transaction: the kept drafts go to the library (a new version for this job,
 * or an update of the version they came from), then the job's CV is written with the draft ids replaced by
 * the saved version ids. If any step fails nothing is saved.
 */
export async function saveAnalysisCv(input: { jobId: string; drafts: unknown[]; cv: z.input<typeof cvInput> }): Promise<ActionResult<SavedAnalysisCv>> {
  const parsed = saveCvInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, drafts, cv } = parsed.data
  return attempt('saveAnalysisCv', () =>
    db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true } })
      if (!job) return fail<SavedAnalysisCv>(MISSING_JOB)
      const saved: SavedDraft[] = []
      const idMap: Record<string, string> = {}
      for (const draft of drafts) {
        const result = updatesVersion(draft) ? await updateVersionFromDraft(tx, draft.fromVersionId, draft) : await saveDraftToLibrary(tx, draft, { jobId })
        saved.push(result)
        idMap[draftVersionId(draft.key)] = result.versionId
      }
      const { savedLabel } = await writeCv(tx, { jobId, ...cv, items: mapCvItems(cv.items, idMap) })
      await tx.job.update({ where: { id: jobId }, data: { updatedAt: new Date() }, select: { id: true } })
      return ok({ saved, savedLabel, idMap })
    }, TX_OPTIONS),
  )
}

const addExperienceInput = z
  .object({
    jobId: id,
    requirementId: z.string().trim().min(1, 'is missing').max(60, 'is not a valid id'),
    requirementName: z.string().trim().min(1, 'is missing').max(300, 'is too long'),
    experienceId: id.nullable(),
    newExperienceTitle: z.string().trim().min(1, 'Give the new experience a title.').max(120, 'The title is too long (120 characters at most).').nullable(),
    text: z.string().trim().min(1, 'Write the experience first.').max(4000, 'That is too long (4000 characters at most).'),
  })
  .refine((d) => Boolean(d.experienceId) || Boolean(d.newExperienceTitle), { message: 'Pick an experience, or name a new one.' })

export type AddedExperience = { placed: PlacedAnswer; draft: AnalysisDraft }

/**
 * "Not met → + Add experience": the text is added to the chosen experience (or to a new one), then the AI drafts
 * one block from that experience for this CV. The draft comes back with Keep off for the screen to show.
 * If the AI can't draft, the text stays in Experiences and the error says so.
 */
export async function addExperienceForRequirement(input: {
  jobId: string
  requirementId: string
  requirementName: string
  experienceId: string | null
  newExperienceTitle: string | null
  text: string
}): Promise<ActionResult<AddedExperience>> {
  const parsed = addExperienceInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, requirementId, requirementName, experienceId, newExperienceTitle, text } = parsed.data
  const added = await attempt('addExperienceForRequirement', () =>
    db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId }, select: { company: true, role: true } })
      if (!job) throw gone()
      const entry = answerEntry({ jobLabel: jobLabel(job), question: `Experience that shows “${requirementName}”`, answer: text })
      return ok(await appendAnswerToExperience(tx, experienceId, entry, { newExperienceTitle }))
    }),
  )
  if (!added.ok) return fail(added.error)
  const placed = added.data
  const drafted = await draftBlockFromExperience({ experienceId: placed.experienceId })
  if (!drafted.ok) return fail(`Your text was added to “${placed.title}”, but the AI couldn’t draft a block from it. ${drafted.error}`)
  const block = drafted.data.blockId
    ? await db.block
        .findUnique({ where: { id: drafted.data.blockId }, select: { name: true, versions: { orderBy: [{ isBase: 'desc' }, { position: 'asc' }], take: 1, select: { id: true, name: true } } } })
        .catch(() => null)
    : null
  const draft = analysisDraftForRequirement(drafted.data, {
    requirementId,
    requirementName,
    experienceTitle: placed.title,
    blockName: block?.name ?? null,
    from: block?.versions[0] ?? null,
  })
  return ok({ placed, draft })
}

'use server'

// Job analysis writes: start from a posting (link or pasted text), autosave the session, save the CV with the
// drafts you kept, add an experience for a requirement that is not met, rename a job. Every input is validated;
// every success refreshes the route, except the autosave.
import type { Prisma } from '@prisma/client'
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { draftBlockFromExperience, readJobInfo } from '../ai/actions'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { draftVersionInput } from '../ai/draft-schema'
import { jobNamesFrom } from '../ai/job-info'
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
import { fetchPosting } from './fetch-posting'
import { MAX_POSTING_CHARS } from './html-text'
import { toJobSummary } from './job-summary'
import { readPostingUrl } from './read-posting'
import { analysisDraftForRequirement } from './requirement-draft'
import { analysisSessionSchema, MAX_SESSION_CHARS } from './session'
import { guessLinkKind, type JobSummary, type ReadResult } from './types'
import { checkUrl } from './url-guard'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')
const names = z.object({
  company: z.string().trim().max(120, 'Company is too long (120 characters at most).'),
  role: z.string().trim().min(1, 'Give the job a role, e.g. “Backend Engineer”.').max(160, 'Role is too long (160 characters at most).'),
})

async function attempt<T>(what: string, work: () => Promise<ActionResult<T>>, duplicate?: string, refreshOnSuccess = true): Promise<ActionResult<T>> {
  try {
    const result = await work()
    if (result.ok && refreshOnSuccess) refresh()
    return result
  } catch (err) {
    if (err instanceof UserError) return fail(err.message)
    console.error(`[analysis] ${what} failed`, dbLogContext(err))
    return fail(plainDbError(err, duplicate))
  }
}

/** @deprecated Job analysis v2 starts from a posting (startFromPosting). Remove with the old screen. "+ New job". A job that already exists (same company and role) is opened instead of duplicated. */
export async function createJob(input: { company: string; role: string }): Promise<ActionResult<{ job: JobSummary; existed: boolean }>> {
  const parsed = names.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { company, role } = parsed.data
  return attempt('createJob', async () => {
    const existing = await db.job.findUnique({ where: { company_role: { company, role } }, include: { links: { orderBy: { position: 'asc' } } } })
    const job = existing ?? (await db.job.create({ data: { company, role }, include: { links: true } }))
    return ok({
      existed: Boolean(existing),
      job: { id: job.id, company: job.company, role: job.role, label: jobLabel(job), links: job.links.map((l) => ({ id: l.id, kind: l.kind, url: l.url })), postingChars: job.postingText.length },
    })
  })
}

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

const readInput = z.object({ jobId: id, urls: z.array(z.string().trim().max(2048, 'That link is too long.')).max(5, 'Read at most 5 links at a time.') })

/**
 * @deprecated Replaced by startFromPosting. Remove with the old screen.
 * Reads the posting from the links you typed (saved on the job), or from the job's posting links.
 * What could be read is saved as the job's posting text; what couldn't says why.
 */
export async function readPosting(input: { jobId: string; urls: string[] }): Promise<ActionResult<{ results: ReadResult[]; postingChars: number; job: JobSummary }>> {
  const parsed = readInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId } = parsed.data
  const typed: string[] = []
  for (const raw of parsed.data.urls.filter(Boolean)) {
    const check = checkUrl(raw)
    if (!check.ok) return fail(`${raw}: ${check.error}`)
    typed.push(check.url.toString())
  }
  return attempt('readPosting', async () => {
    const job = await db.job.findUnique({ where: { id: jobId }, include: { links: { orderBy: { position: 'asc' } } } })
    if (!job) return fail('This job no longer exists. Reload the page.')
    const known = new Set(job.links.map((l) => l.url))
    const fresh = typed.filter((u) => !known.has(u))
    const toRead = typed.length ? typed : job.links.filter((l) => l.kind === 'POSTING' || l.kind === 'APPLICATION').map((l) => l.url)
    if (!toRead.length) return fail('Add a link to the job posting, or paste the job text.')

    const fetched = await Promise.all(toRead.map((u) => fetchPosting(u)))
    const results: ReadResult[] = fetched.map((r, i) => (r.ok ? { url: r.url, ok: true, title: r.title, message: r.truncated ? 'Very long page: only the first part was kept.' : null } : { url: toRead[i], ok: false, title: null, message: r.message }))
    const texts = fetched.flatMap((r) => (r.ok ? [r] : []))
    const combined = texts.length === 1 ? texts[0].text : texts.map((t) => `From ${t.url}:\n${t.text}`).join('\n\n')
    const postingText = combined.slice(0, MAX_POSTING_CHARS)

    const start = job.links.reduce((max, l) => Math.max(max, l.position), -1) + 1
    const updated = await db.job.update({
      where: { id: jobId },
      data: {
        ...(texts.length ? { postingText } : {}),
        links: { create: fresh.map((url, i) => ({ url, kind: guessLinkKind(url), position: start + i })) },
      },
      include: { links: { orderBy: { position: 'asc' } } },
    })
    return ok({
      results,
      postingChars: updated.postingText.length,
      job: {
        id: updated.id,
        company: updated.company,
        role: updated.role,
        label: jobLabel(updated),
        links: updated.links.map((l) => ({ id: l.id, kind: l.kind, url: l.url })),
        postingChars: updated.postingText.length,
      },
    })
  })
}

const pasteInput = z.object({
  jobId: id,
  text: z.string().trim().min(80, 'Paste the whole posting: what you pasted is too short to analyze.').max(MAX_POSTING_CHARS, `That is too long (${MAX_POSTING_CHARS.toLocaleString('en')} characters at most). Paste only the posting.`),
})

/** @deprecated Replaced by startFromPosting({ text }). Remove with the old screen. "Paste the job text": for sites that don't let apps read them. */
export async function savePostingText(input: { jobId: string; text: string }): Promise<ActionResult<{ postingChars: number }>> {
  const parsed = pasteInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, text } = parsed.data
  return attempt('savePostingText', async () => {
    const job = await db.job.update({ where: { id: jobId }, data: { postingText: text }, select: { postingText: true } })
    return ok({ postingChars: job.postingText.length })
  })
}

const saveInput = z.object({ jobId: id, drafts: z.array(draftVersionInput).min(1, 'Keep at least one draft to save.').max(20) })

/** @deprecated Replaced by saveAnalysisCv. Remove with the old screen. Save: stores only the drafts you kept, each linked to the job (VersionJob). */
export async function saveAnalysisDrafts(input: { jobId: string; drafts: unknown[] }): Promise<ActionResult<{ saved: SavedDraft[] }>> {
  const parsed = saveInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { jobId, drafts } = parsed.data
  return attempt('saveAnalysisDrafts', () =>
    db.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true } })
      if (!job) return fail<{ saved: SavedDraft[] }>('This job no longer exists. Reload the page.')
      const saved: SavedDraft[] = []
      for (const draft of drafts) saved.push(await saveDraftToLibrary(tx, draft, { jobId }))
      await tx.job.update({ where: { id: jobId }, data: { updatedAt: new Date() } })
      return ok({ saved })
    }),
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

export type StartedJob = { job: JobSummary; existed: boolean; postingText: string }

/**
 * The v2 start: read the posting (from a link, or the pasted text), let the AI name the company and role,
 * then find the job with that exact pair (`existed: true`) or create it. The posting text is saved on the job
 * and the link is added to it when it is new.
 */
export async function startFromPosting(input: { url: string } | { text: string }): Promise<ActionResult<StartedJob>> {
  let postingText: string
  let url: string | null = null
  let title: string | null = null
  if (input && 'url' in input && typeof input.url === 'string') {
    const parsedUrl = urlInput.safeParse(input.url)
    if (!parsedUrl.success) return fail(invalidInput(parsedUrl.error))
    const read = await readPostingUrl(parsedUrl.data)
    if (!read.ok) return fail(read.error)
    ;({ text: postingText, url, title } = read)
  } else if (input && 'text' in input && typeof input.text === 'string') {
    const parsedText = pastedInput.safeParse(input.text)
    if (!parsedText.success) return fail(invalidInput(parsedText.error))
    postingText = parsedText.data
  } else {
    return fail('Paste a link to the job posting, or the job text.')
  }

  const info = await readJobInfo({ postingText })
  if (!info.ok) return fail(info.error)
  const names = jobNamesFrom(info.data, title)
  if (!names) return fail('Couldn’t tell which job this is. Check that it is the whole posting, or paste the job text.')

  return attempt('startFromPosting', async () => {
    const include = { links: { orderBy: { position: 'asc' as const } } }
    const existing = await db.job.findUnique({ where: { company_role: names }, include })
    const nextPosition = (existing?.links ?? []).reduce((max, l) => Math.max(max, l.position), -1) + 1
    const link = url ? { url, kind: guessLinkKind(url), position: nextPosition } : null
    const job = existing
      ? await db.job.update({
          where: { id: existing.id },
          data: { postingText, ...(link && !existing.links.some((l) => l.url === url) ? { links: { create: link } } : {}) },
          include,
        })
      : await db.job.create({ data: { ...names, postingText, ...(link ? { links: { create: [link] } } : {}) }, include })
    return ok({ job: toJobSummary(job), existed: Boolean(existing), postingText })
  })
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
    .array(z.object({ section: sectionSchema, position: z.number().int().min(0).max(MAX_CV_ITEMS), versionId: z.string().trim().min(1).max(80) }))
    .max(MAX_CV_ITEMS),
})
const saveCvInput = z.object({ jobId: id, drafts: z.array(keptDraftInput).max(20, 'Keep at most 20 drafts.'), cv: cvInput })

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
    }),
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

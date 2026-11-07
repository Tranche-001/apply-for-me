'use server'

// Job analysis writes: create / rename a job, read its posting (or take pasted text), and save the drafts
// you kept. Every input is validated; every success refreshes the route.
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { draftVersionInput } from '../ai/draft-schema'
import { jobLabel } from '../ai/labels'
import { saveDraftToLibrary, type SavedDraft } from '../ai/library-writes'
import { fail, invalidInput, ok, type ActionResult } from '../ai/result'
import { fetchPosting } from './fetch-posting'
import { MAX_POSTING_CHARS } from './html-text'
import { guessLinkKind, type JobSummary, type ReadResult } from './types'
import { checkUrl } from './url-guard'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')
const names = z.object({
  company: z.string().trim().max(120, 'Company is too long (120 characters at most).'),
  role: z.string().trim().min(1, 'Give the job a role, e.g. “Backend Engineer”.').max(160, 'Role is too long (160 characters at most).'),
})

async function attempt<T>(what: string, work: () => Promise<ActionResult<T>>, duplicate?: string): Promise<ActionResult<T>> {
  try {
    const result = await work()
    if (result.ok) refresh()
    return result
  } catch (err) {
    console.error(`[analysis] ${what} failed`, dbLogContext(err))
    return fail(plainDbError(err, duplicate))
  }
}

/** "+ New job". A job that already exists (same company and role) is opened instead of duplicated. */
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

/** "Paste the job text": for sites that don't let apps read them. */
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

/** Save: stores only the drafts you kept, each linked to the job (VersionJob). */
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

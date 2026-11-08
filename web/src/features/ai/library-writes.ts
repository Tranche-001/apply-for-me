import 'server-only'
// Writes a kept draft into the library: a new version of an existing block, or a new block with its
// Base version. Optionally links the experience it came from and the job it was made for.
import type { Prisma } from '@prisma/client'
import type { DraftVersionInput } from './draft-schema'
import { nextFreeName, slugify } from './naming'

export type SavedDraft = { blockId: string; blockName: string; versionId: string; versionName: string; isNewBlock: boolean }

type Tx = Prisma.TransactionClient

export function bulletRows(draft: Pick<DraftVersionInput, 'bullets'>) {
  return draft.bullets
    .filter((b) => b.kind === 'MISSING' || b.text)
    .map((b, position) => ({ kind: b.kind, text: b.kind === 'MISSING' ? '' : b.text, want: b.kind === 'MISSING' ? (b.want ?? null) : null, position }))
}

/**
 * "Save as: Update": the version the draft started from takes the draft's title and bullets; its name stays.
 * Throws 'block-missing' (plain "deleted" error) when the version is gone or is not a version of the draft's block.
 */
export async function updateVersionFromDraft(tx: Tx, versionId: string, draft: DraftVersionInput): Promise<SavedDraft> {
  const version = await tx.version.findUnique({ where: { id: versionId }, select: { id: true, name: true, blockId: true, block: { select: { name: true } } } })
  if (!version || version.blockId !== draft.blockId) throw new Error('block-missing')
  await tx.version.update({ where: { id: version.id }, data: { title: draft.title, bullets: { deleteMany: {}, create: bulletRows(draft) } } })
  return { blockId: version.blockId, blockName: version.block.name, versionId: version.id, versionName: version.name, isNewBlock: false }
}

type BulletRow = { kind: string; text: string; want: string | null }
const sameBullets = (a: readonly BulletRow[], b: readonly BulletRow[]): boolean =>
  a.length === b.length && a.every((x, i) => x.kind === b[i].kind && x.text === b[i].text && x.want === b[i].want)

/**
 * "Role titles for this job" on a version used as it is: the version itself is never changed. A version of the same
 * block made for this job with that title and the same bullets is used again; otherwise a copy of the version, with
 * the new title, becomes a new version for this job (named `name`, the job's label). Throws 'block-missing' when the
 * version is gone, so the caller's transaction rolls back.
 */
export async function saveTitleForJob(tx: Tx, versionId: string, title: string, link: { jobId: string; name: string }): Promise<SavedDraft> {
  const bullets = { orderBy: { position: 'asc' as const }, select: { kind: true, text: true, want: true } }
  const source = await tx.version.findUnique({
    where: { id: versionId },
    select: {
      title: true,
      bullets,
      block: { select: { id: true, name: true, versions: { select: { id: true, name: true, title: true, position: true, bullets, jobs: { select: { jobId: true } } } } } },
    },
  })
  if (!source) throw new Error('block-missing')
  const { block } = source
  const done = (id: string, name: string): SavedDraft => ({ blockId: block.id, blockName: block.name, versionId: id, versionName: name, isNewBlock: false })
  const made = block.versions.find((v) => v.title === title && v.jobs.some((j) => j.jobId === link.jobId) && sameBullets(v.bullets, source.bullets))
  if (made) return done(made.id, made.name)
  const name = nextFreeName(link.name || 'New version', block.versions.map((v) => v.name))
  const position = block.versions.reduce((max, v) => Math.max(max, v.position), -1) + 1
  const version = await tx.version.create({
    data: {
      blockId: block.id,
      name,
      title,
      isBase: false,
      themes: [],
      position,
      bullets: { create: source.bullets.map((b, i) => ({ kind: b.kind, text: b.text, want: b.want, position: i })) },
      jobs: { create: [{ jobId: link.jobId }] },
    },
  })
  return done(version.id, name)
}

async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name)
  const taken = await tx.block.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })
  return nextFreeName(base, taken.map((t) => t.slug), '-')
}

/** Saves one draft. Throws on a missing block so the caller's transaction rolls back. */
export async function saveDraftToLibrary(
  tx: Tx,
  draft: DraftVersionInput,
  link: { experienceId?: string | null; jobId?: string | null } = {},
): Promise<SavedDraft> {
  const jobs = link.jobId ? { create: [{ jobId: link.jobId }] } : undefined

  if (draft.blockId) {
    const block = await tx.block.findUnique({ where: { id: draft.blockId }, include: { versions: { select: { name: true, position: true } } } })
    if (!block) throw new Error('block-missing')
    const name = nextFreeName(draft.name || 'New version', block.versions.map((v) => v.name))
    const position = block.versions.reduce((max, v) => Math.max(max, v.position), -1) + 1
    const version = await tx.version.create({
      data: { blockId: block.id, name, title: draft.title, isBase: false, themes: [], position, bullets: { create: bulletRows(draft) }, jobs },
    })
    return { blockId: block.id, blockName: block.name, versionId: version.id, versionName: name, isNewBlock: false }
  }

  const nb = draft.newBlock!
  const last = await tx.block.findFirst({ where: { section: nb.section }, orderBy: { position: 'desc' }, select: { position: true } })
  const block = await tx.block.create({
    data: {
      slug: await uniqueSlug(tx, nb.name),
      name: nb.name,
      section: nb.section,
      org: nb.org,
      location: nb.location,
      dates: nb.dates,
      stack: nb.stack,
      position: (last?.position ?? -1) + 1,
      experienceId: link.experienceId ?? null,
      versions: { create: [{ name: 'Base', title: draft.title, isBase: true, themes: [], position: 0, bullets: { create: bulletRows(draft) }, jobs }] },
    },
    include: { versions: { select: { id: true } } },
  })
  return { blockId: block.id, blockName: block.name, versionId: block.versions[0].id, versionName: 'Base', isNewBlock: true }
}

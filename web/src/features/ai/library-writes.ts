import 'server-only'
// Writes a kept draft into the library: a new version of an existing block, or a new block with its
// Base version. Optionally links the experience it came from and the job it was made for.
import type { Prisma } from '@prisma/client'
import type { DraftVersionInput } from './draft-schema'
import { nextFreeName, slugify } from './naming'

export type SavedDraft = { blockId: string; blockName: string; versionId: string; versionName: string; isNewBlock: boolean }

type Tx = Prisma.TransactionClient

function bulletRows(draft: DraftVersionInput) {
  return draft.bullets
    .filter((b) => b.kind === 'MISSING' || b.text)
    .map((b, position) => ({ kind: b.kind, text: b.kind === 'MISSING' ? '' : b.text, want: b.kind === 'MISSING' ? (b.want ?? null) : null, position }))
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

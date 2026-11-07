'use server'

// Writes to the block library: versions (new, updated, merged, linked to a job), new blocks and their order.
import { refresh } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { UserError, fail, firstIssue, guarded, type ActionResult } from '@/features/cv/action-result'
import { jobLabel } from '@/features/jobs/links'
import { uniqueName } from './bullets'
import { toLibBlock, toLibVersion, versionInclude } from './queries'
import { idSchema, sectionSchema, versionContentSchema, versionNameSchema } from './schemas'
import type { BulletData, LibBlock, LibVersion } from './types'

type Tx = Prisma.TransactionClient

function bulletRows(bullets: BulletData[]) {
  return bullets.map((b, position) => ({ kind: b.kind, text: b.text, want: b.want, position }))
}

async function labelOfJob(tx: Tx, jobId: string): Promise<string> {
  const job = await tx.job.findUnique({ where: { id: jobId }, select: { company: true, role: true } })
  if (!job) throw new UserError('That job no longer exists. Pick another one.')
  return jobLabel(job.company, job.role)
}

async function readVersion(tx: Tx, id: string): Promise<LibVersion> {
  return toLibVersion(await tx.version.findUniqueOrThrow({ where: { id }, include: versionInclude }))
}

const createVersionSchema = versionContentSchema.extend({
  blockId: idSchema,
  /** Themes are copied from the version you started from. */
  sourceVersionId: idSchema.nullable(),
  /** Empty: the version takes the job's name (decision log: no name field for a job's version). */
  name: versionNameSchema,
  jobId: idSchema.nullable(),
})

/** A new version of a block, optionally made for a job (it is named after the job and linked to it). */
export async function createVersion(input: z.input<typeof createVersionSchema>): Promise<ActionResult<LibVersion>> {
  const parsed = createVersionSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const d = parsed.data
  const result = await guarded('createVersion', 'Couldn’t save the new version. Your edits are still here; try again.', () =>
    db.$transaction(async (tx) => {
      const block = await tx.block.findUnique({ where: { id: d.blockId }, include: { versions: { select: { name: true, position: true, id: true, themes: true } } } })
      if (!block) throw new UserError('That block no longer exists.')
      const base = d.name || (d.jobId ? await labelOfJob(tx, d.jobId) : '')
      const source = block.versions.find((v) => v.id === d.sourceVersionId)
      const created = await tx.version.create({
        data: {
          blockId: block.id,
          name: uniqueName(base, block.versions.map((v) => v.name)),
          title: d.title,
          isBase: false,
          themes: source?.themes ?? [],
          position: Math.max(-1, ...block.versions.map((v) => v.position)) + 1,
          bullets: { create: bulletRows(d.bullets) },
          jobs: d.jobId ? { create: [{ jobId: d.jobId }] } : undefined,
        },
      })
      return readVersion(tx, created.id)
    }),
  )
  if (result.ok) refresh()
  return result
}

const updateVersionSchema = versionContentSchema.extend({
  versionId: idSchema,
  /** Only the library editor renames; Compose leaves it out. */
  name: versionNameSchema.optional(),
  linkJobId: idSchema.nullable().optional(),
})

/** Update a version everywhere: every CV that uses it changes too. */
export async function updateVersion(input: z.input<typeof updateVersionSchema>): Promise<ActionResult<LibVersion>> {
  const parsed = updateVersionSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const d = parsed.data
  const result = await guarded('updateVersion', 'Couldn’t update the version. Your edits are still here; try again.', () =>
    db.$transaction(async (tx) => {
      const version = await tx.version.findUnique({ where: { id: d.versionId }, include: { block: { include: { versions: { select: { id: true, name: true } } } } } })
      if (!version) throw new UserError('That version no longer exists.')
      const name = d.name === undefined ? version.name : d.name || version.name
      const clash = version.block.versions.some((v) => v.id !== version.id && v.name.toLowerCase() === name.toLowerCase())
      if (clash) throw new UserError(`Another version of ${version.block.name} is already called “${name}”.`)
      if (d.linkJobId) await labelOfJob(tx, d.linkJobId)
      await tx.bullet.deleteMany({ where: { versionId: version.id } })
      await tx.version.update({
        where: { id: version.id },
        data: {
          name,
          title: d.title,
          bullets: { create: bulletRows(d.bullets) },
          jobs: d.linkJobId ? { connectOrCreate: [{ where: { versionId_jobId: { versionId: version.id, jobId: d.linkJobId } }, create: { jobId: d.linkJobId } }] } : undefined,
        },
      })
      return readVersion(tx, version.id)
    }),
  )
  if (result.ok) refresh()
  return result
}

const createBlockSchema = versionContentSchema.extend({
  name: z.string().trim().min(1, 'Add a name for the block.').max(120),
  section: sectionSchema,
  org: z.string().trim().max(160),
  location: z.string().trim().max(120),
  dates: z.string().trim().max(120),
  stack: z.string().trim().max(300),
  jobId: idSchema.nullable(),
})

function slugify(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'block'
}

function uniqueSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  let k = 2
  while (used.has(`${base}-${k}`)) k += 1
  return `${base}-${k}`
}

/** A new block in the library, with its Base version (linked to the job you wrote it for). */
export async function createBlock(input: z.input<typeof createBlockSchema>): Promise<ActionResult<LibBlock>> {
  const parsed = createBlockSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const d = parsed.data
  const result = await guarded('createBlock', 'Couldn’t add the block. What you wrote is still here; try again.', () =>
    db.$transaction(async (tx) => {
      if (d.jobId) await labelOfJob(tx, d.jobId)
      const slugBase = slugify(d.name)
      const taken = await tx.block.findMany({ where: { slug: { startsWith: slugBase } }, select: { slug: true } })
      const slug = uniqueSlug(slugBase, taken.map((t) => t.slug))
      const last = await tx.block.aggregate({ _max: { position: true } })
      const block = await tx.block.create({
        data: {
          slug,
          name: d.name,
          section: d.section,
          org: d.section === 'EXPERIENCE' ? d.org : '',
          location: d.section === 'EXPERIENCE' ? d.location : '',
          dates: d.section === 'EXPERIENCE' ? d.dates : '',
          stack: d.section === 'PROJECT' ? d.stack : '',
          position: (last._max.position ?? -1) + 1,
          versions: {
            create: [
              {
                name: 'Base',
                title: d.title,
                isBase: true,
                themes: [],
                position: 0,
                bullets: { create: bulletRows(d.bullets) },
                jobs: d.jobId ? { create: [{ jobId: d.jobId }] } : undefined,
              },
            ],
          },
        },
        include: { versions: { include: versionInclude } },
      })
      return toLibBlock(block)
    }),
  )
  if (result.ok) refresh()
  return result
}

const mergeSchema = z.object({ fromId: idSchema, intoId: idSchema })

/** Merge an identical version into the earlier one: its jobs and CVs move over, then it is removed. */
export async function mergeVersion(input: z.input<typeof mergeSchema>): Promise<ActionResult<{ intoId: string }>> {
  const parsed = mergeSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { fromId, intoId } = parsed.data
  const result = await guarded('mergeVersion', 'Couldn’t merge the versions. Nothing was changed.', () =>
    db.$transaction(async (tx) => {
      const [from, into] = await Promise.all([
        tx.version.findUnique({ where: { id: fromId }, include: { jobs: true } }),
        tx.version.findUnique({ where: { id: intoId } }),
      ])
      if (!from || !into || from.blockId !== into.blockId || from.id === into.id) throw new UserError('Those versions can’t be merged.')
      if (from.isBase) throw new UserError('The Base version can’t be merged into another one.')
      if (from.jobs.length) {
        await tx.versionJob.createMany({ data: from.jobs.map((j) => ({ versionId: into.id, jobId: j.jobId })), skipDuplicates: true })
      }
      await tx.cvItem.updateMany({ where: { versionId: from.id }, data: { versionId: into.id } })
      await tx.version.delete({ where: { id: from.id } })
      return { intoId: into.id }
    }),
  )
  if (result.ok) refresh()
  return result
}

const linkSchema = z.object({ versionId: idSchema, jobId: idSchema })

/** Use an existing version for a job instead of saving an identical copy (decision log). */
export async function linkVersionToJob(input: z.input<typeof linkSchema>): Promise<ActionResult<LibVersion>> {
  const parsed = linkSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { versionId, jobId } = parsed.data
  const result = await guarded('linkVersionToJob', 'Couldn’t link the job. Try again.', () =>
    db.$transaction(async (tx) => {
      await labelOfJob(tx, jobId)
      await tx.versionJob.createMany({ data: [{ versionId, jobId }], skipDuplicates: true })
      return readVersion(tx, versionId)
    }),
  )
  if (result.ok) refresh()
  return result
}

const reorderSchema = z.object({ ids: z.array(idSchema).min(1).max(2000) })

/** The library's order (drag or arrows). */
export async function reorderBlocks(input: z.input<typeof reorderSchema>): Promise<ActionResult<null>> {
  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { ids } = parsed.data
  const result = await guarded('reorderBlocks', 'Couldn’t save the new order. Try again.', async () => {
    await db.$transaction(ids.map((id, position) => db.block.update({ where: { id }, data: { position } })))
    return null
  })
  if (result.ok) refresh()
  return result
}

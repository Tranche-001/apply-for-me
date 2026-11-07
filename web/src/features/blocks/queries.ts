import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { LibBlock, LibVersion } from './types'

export const versionInclude = {
  bullets: { orderBy: { position: 'asc' } },
  jobs: { select: { jobId: true } },
} satisfies Prisma.VersionInclude

type VersionRow = Prisma.VersionGetPayload<{ include: typeof versionInclude }>

export function toLibVersion(v: VersionRow): LibVersion {
  return {
    id: v.id,
    blockId: v.blockId,
    name: v.name,
    title: v.title,
    isBase: v.isBase,
    themes: v.themes,
    position: v.position,
    bullets: v.bullets.map((b) => ({ kind: b.kind, text: b.text, want: b.want })),
    jobIds: v.jobs.map((j) => j.jobId),
  }
}

type BlockRow = Prisma.BlockGetPayload<{ include: { versions: { include: typeof versionInclude } } }>

export function toLibBlock(b: BlockRow): LibBlock {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    section: b.section,
    org: b.org,
    location: b.location,
    dates: b.dates,
    stack: b.stack,
    position: b.position,
    versions: b.versions.map(toLibVersion),
  }
}

/** Every block with its versions (Base first, then library order) and the jobs each version was made for. */
export async function getLibrary(): Promise<LibBlock[]> {
  const blocks = await db.block.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { versions: { orderBy: [{ isBase: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }], include: versionInclude } },
  })
  return blocks.map(toLibBlock)
}

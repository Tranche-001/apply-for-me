import type { BulletKind, Section } from '@prisma/client'

/** One bullet of a version. A MISSING bullet is a gap: `want` says which kind is missing (P1). */
export type BulletData = { kind: BulletKind; text: string; want: BulletKind | null }

/** A version of a block, as the screens read it (serializable). */
export type LibVersion = {
  id: string
  blockId: string
  name: string
  title: string
  isBase: boolean
  themes: string[]
  position: number
  bullets: BulletData[]
  /** Jobs this version was made for (it is named after the job). */
  jobIds: string[]
}

/** A block of the library: one CV entry with its versions, Base first. */
export type LibBlock = {
  id: string
  slug: string
  name: string
  section: Section
  org: string
  location: string
  dates: string
  stack: string
  position: number
  versions: LibVersion[]
}

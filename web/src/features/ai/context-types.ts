// Plain data the prompt builders read. Loaded from the database in context.ts, built by hand in tests.
import type { BulletKind, LinkKind, Section } from '@prisma/client'

export const SECTIONS = ['EXPERIENCE', 'PROJECT'] as const satisfies readonly Section[]
export const BULLET_KINDS = [
  'PROJECT',
  'STACK',
  'IMPACT',
  'PROJECT_STACK',
  'PROJECT_IMPACT',
  'STACK_IMPACT',
  'MISSING',
] as const satisfies readonly BulletKind[]

export type LibraryBullet = { kind: BulletKind; text: string; want: BulletKind | null }

export type LibraryVersion = {
  id: string
  name: string
  title: string
  isBase: boolean
  themes: string[]
  /** Labels of the jobs this version was made for. */
  jobs: string[]
  bullets: LibraryBullet[]
}

export type LibraryBlock = {
  id: string
  name: string
  section: Section
  org: string
  location: string
  dates: string
  stack: string
  experienceTitle: string | null
  versions: LibraryVersion[]
}

export type ProfileContext = {
  education: { degree: string; dates: string; school: string; location: string }[]
  skills: { label: string; text: string }[]
  achievements: { title: string; description: string }[]
}

export type JobContext = {
  id: string
  label: string
  company: string
  role: string
  postingText: string
  links: { kind: LinkKind; url: string }[]
}

export type ExperienceContext = {
  id: string
  title: string
  where: string
  when: string
  notes: string
  blockIds: string[]
}

export type QuestionContext = {
  id: string
  short: string
  full: string
  looksFor: string[]
  answer: string // the generalist answer in English
  answerPt: string // the generalist answer in Portuguese
  theory: string
  references: string[]
  useFounder: boolean
  founderNotes: string
  founderRefs: string[]
}

/** An answer to one of the AI's gap questions; `answer: null` means "Don't have it". */
export type GapAnswer = { id: string; question: string; answer: string | null }

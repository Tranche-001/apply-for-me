// The Job analysis session saved with the job (Job.analysis). It comes back from the database and from the
// browser, so it is validated on the way in and on the way out: anything that does not match is dropped (null),
// the page then starts a fresh analysis instead of trusting it. Server-agnostic: no 'server-only' here.
import { z } from 'zod'
import { BULLET_KINDS, SECTIONS } from '../ai/context-types'
import { SESSION_VERSION, type AnalysisSession } from './types'

export const MAX_SESSION_CHARS = 300_000

const MAX_REQUIREMENTS = 20
const MAX_ASKS = 8
const MAX_DRAFTS = 20
const MAX_VERSIONS = 20
const MAX_BULLETS = 8
const MAX_MAP_KEYS = 50

const str = (max: number) => z.string().max(max)
const id = str(80)
const short = str(300)
const long = str(2000)
const answer = str(5000)

const bullet = z.object({ kind: z.enum(BULLET_KINDS), text: str(1000), want: z.enum(BULLET_KINDS).nullable().optional() })
const match = z.object({ requirementId: id, phrases: z.array(str(1000)).max(10), partly: z.boolean() })
const matches = z.array(match).max(MAX_REQUIREMENTS)
const askSchema = z.object({ id, text: long, experienceId: id.nullable().optional(), requirementId: id.nullable().optional() })

const requirementSchema = z.object({
  id,
  text: short,
  status: z.enum(['covered', 'partial', 'missing']),
  evidence: long,
  quotes: z.array(str(1000)).max(3),
  keys: z.array(short).max(12),
})

const newBlockSchema = z.object({
  name: short,
  section: z.enum(SECTIONS),
  org: short,
  location: short,
  dates: short,
  stack: long,
})

const analysisDraftShape = {
  blockId: id.nullable(),
  newBlock: newBlockSchema.nullable(),
  name: short,
  title: short,
  bullets: z.array(bullet).max(MAX_BULLETS),
  waitingOn: id.nullable(),
  key: id,
  blockName: short,
  note: long,
  fromVersionId: id.nullable(),
  fromVersionName: short.nullable(),
  improvedBy: id.nullable(),
  matches,
}

const versionViewShape = {
  versionId: id,
  blockId: id,
  blockName: short,
  versionName: short,
  section: z.enum(SECTIONS),
  title: short,
  org: short,
  location: short,
  dates: short,
  stack: long,
  bullets: z.array(bullet).max(MAX_BULLETS),
  why: long,
  matches,
}

const jobAnalysisSchema = z.object({
  requirements: z.array(requirementSchema).max(MAX_REQUIREMENTS),
  asks: z.array(askSchema).max(MAX_ASKS),
  drafts: z.array(z.object(analysisDraftShape)).max(MAX_DRAFTS),
  reused: z.array(z.object(versionViewShape)).max(MAX_VERSIONS),
  leftOut: z.array(z.object(versionViewShape)).max(MAX_VERSIONS),
  report: z.array(z.object({ tag: z.enum(['NEW', 'REUSED', 'ORDER', 'ADDED', 'LEFT OUT', 'NOTE']), text: long })).max(60),
})

const sentAnswerSchema = z.object({
  question: long,
  answer: answer.nullable(),
  entry: answer.nullable(),
  experienceId: id.nullable(),
  experienceTitle: short,
  isNewExperience: z.boolean(),
  resent: z.boolean(),
})

const sessionDraftSchema = z.object({
  ...analysisDraftShape,
  keep: z.boolean(),
  editedByHand: z.boolean(),
  saveAs: z.enum(['new', 'update']),
})

const record = <T extends z.ZodType>(value: T) =>
  z.record(id, value).refine((r) => Object.keys(r).length <= MAX_MAP_KEYS, { message: 'too many entries' })

export const analysisSessionSchema = z.object({
  v: z.literal(SESSION_VERSION),
  analysis: jobAnalysisSchema,
  answers: record(answer),
  dont: record(z.boolean()),
  sent: record(sentAnswerSchema),
  drafts: z.array(sessionDraftSchema).max(MAX_DRAFTS),
  asIsOut: z.array(id).max(MAX_VERSIONS),
  pages: z.union([z.literal(1), z.literal(2)]),
  step: z.enum(['input', 'drafts', 'review', 'saved']),
  analyzedAt: str(40),
  savedAt: str(40).nullable(),
})

/** The session when `value` is a valid current-version session; otherwise null. Never throws. */
export function parseSession(value: unknown): AnalysisSession | null {
  try {
    if ((JSON.stringify(value) ?? '').length > MAX_SESSION_CHARS) return null
    const parsed = analysisSessionSchema.safeParse(value)
    return parsed.success ? (parsed.data as AnalysisSession) : null
  } catch {
    return null
  }
}

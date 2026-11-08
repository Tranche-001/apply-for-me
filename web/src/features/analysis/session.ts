// The Job analysis session saved with the job (Job.analysis). It comes back from the database and from the
// browser, so it is validated on the way in and on the way out: anything that does not match is dropped (null),
// the page then starts a fresh analysis instead of trusting it. Server-agnostic: no 'server-only' here.
import { z } from 'zod'
import { BULLET_KINDS, SECTIONS } from '../ai/context-types'
import type { AiAsk, AnalysisDraft, DraftBullet, JobAnalysis, JobRequirement, ProfileEvidence, RequirementMatch, VersionView } from '../ai/types'
import { SESSION_VERSION, type AnalysisSession } from './types'

export const MAX_SESSION_CHARS = 300_000

/** What the session schema accepts. The AI's analysis is fitted to these (fitAnalysis) before the client gets it. */
export const SESSION_LIMITS = {
  requirements: 20,
  asks: 8,
  drafts: 20,
  versions: 20,
  bullets: 8,
  report: 60,
  quotes: 3,
  keys: 12,
  phrases: 10,
  mapKeys: 50,
  profile: 40,
  /** Blocks in the CV's order, role titles and title choices: every draft and every version used as it is. */
  cvBlocks: 40,
  /** A block key: a block id, or `new:` and a new block's name (up to `short`). */
  blockKey: 310,
  id: 80,
  short: 300,
  long: 2000,
  quote: 1000,
  phrase: 1000,
  key: 300,
  bulletText: 1000,
  answer: 5000,
} as const

const L = SESSION_LIMITS
const MAX_REQUIREMENTS = L.requirements
const MAX_ASKS = L.asks
const MAX_DRAFTS = L.drafts
const MAX_VERSIONS = L.versions
const MAX_BULLETS = L.bullets
const MAX_MAP_KEYS = L.mapKeys

const str = (max: number) => z.string().max(max)
const id = str(L.id)
const short = str(L.short)
const long = str(L.long)
const answer = str(L.answer)

const bullet = z.object({ kind: z.enum(BULLET_KINDS), text: str(L.bulletText), want: z.enum(BULLET_KINDS).nullable().optional() })
const match = z.object({ requirementId: id, phrases: z.array(str(L.phrase)).max(L.phrases), partly: z.boolean() })
const matches = z.array(match).max(MAX_REQUIREMENTS)
const askSchema = z.object({ id, text: long, experienceId: id.nullable().optional(), requirementId: id.nullable().optional() })

const requirementSchema = z.object({
  id,
  text: short,
  status: z.enum(['covered', 'partial', 'missing']),
  evidence: long,
  quotes: z.array(str(L.quote)).max(L.quotes),
  keys: z.array(str(L.key)).max(L.keys),
})

const profileEvidenceSchema = z.object({
  requirementId: id,
  kind: z.enum(['education', 'skills', 'achievement']),
  title: short,
  dates: short,
  detail: long,
  phrases: z.array(str(L.phrase)).max(L.phrases),
  partly: z.boolean(),
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
  report: z.array(z.object({ tag: z.enum(['NEW', 'REUSED', 'ORDER', 'ADDED', 'LEFT OUT', 'NOTE']), text: long })).max(L.report),
  // Optional: sessions saved before the profile counted as evidence have none.
  profile: z.array(profileEvidenceSchema).max(L.profile).optional(),
  // Optional: sessions saved before the AI ordered the blocks and recommended role titles have neither.
  order: z.array(str(L.blockKey)).max(L.cvBlocks).optional(),
  roleTitles: z.array(z.object({ block: str(L.blockKey), title: short })).max(L.cvBlocks).optional(),
})

const titleChoiceSchema = z.object({ pick: z.enum(['ai', 'mine', 'own']), own: short })

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

const blockKeys = z.array(str(L.blockKey)).max(L.cvBlocks)
const arrangementSchema = z.object({
  order: blockKeys.optional(),
  swappedIn: z.array(id).max(MAX_VERSIONS).optional(),
  swappedOut: blockKeys.optional(),
  sections: z
    .record(str(L.blockKey), z.enum(SECTIONS))
    .refine((r) => Object.keys(r).length <= L.cvBlocks, { message: 'too many entries' })
    .optional(),
  oneSection: z.boolean().optional(),
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
  // Optional: the role title picked per experience block ("Role titles for this job"); none = the title you have.
  titles: z
    .record(str(L.blockKey), titleChoiceSchema)
    .refine((r) => Object.keys(r).length <= L.cvBlocks, { message: 'too many entries' })
    .optional(),
  // Optional: how you arranged the CV on review (order, swaps, sections); none = as the AI gave it.
  arrangement: arrangementSchema.optional(),
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

// ---- Fitting an analysis to the limits above ----

/** `text` cut to `max` characters, ending in "…" when it was cut (never leaving half an emoji). */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return `${cut}…`
}

const fitId = (value: string): string => value.slice(0, L.id)
const fitIdOrNull = <T extends string | null | undefined>(value: T): T => (typeof value === 'string' ? (fitId(value) as T) : value)
const within = (max: number) => (value: string) => value.length <= max
const fitBullets = (bullets: readonly DraftBullet[]): DraftBullet[] => bullets.slice(0, L.bullets).map((b) => ({ ...b, text: truncate(b.text, L.bulletText) }))

function fitMatches(matches: readonly RequirementMatch[], requirementIds: ReadonlySet<string>): RequirementMatch[] {
  return matches
    .map((m) => ({ ...m, requirementId: fitId(m.requirementId) }))
    .filter((m) => requirementIds.has(m.requirementId))
    .slice(0, L.requirements)
    .map((m) => ({ ...m, phrases: m.phrases.filter(within(L.phrase)).slice(0, L.phrases) }))
}

function fitView<T extends VersionView & { why: string; matches: RequirementMatch[] }>(v: T, requirementIds: ReadonlySet<string>): T {
  return {
    ...v,
    versionId: fitId(v.versionId),
    blockId: fitId(v.blockId),
    blockName: truncate(v.blockName, L.short),
    versionName: truncate(v.versionName, L.short),
    title: truncate(v.title, L.short),
    org: truncate(v.org, L.short),
    location: truncate(v.location, L.short),
    dates: truncate(v.dates, L.short),
    stack: truncate(v.stack, L.long),
    bullets: fitBullets(v.bullets),
    why: truncate(v.why, L.long),
    matches: fitMatches(v.matches, requirementIds),
  }
}

function fitDraft(d: AnalysisDraft, requirementIds: ReadonlySet<string>, askIds: ReadonlySet<string>): AnalysisDraft {
  const improvedBy = d.improvedBy === null ? null : fitId(d.improvedBy)
  return {
    ...d,
    key: fitId(d.key),
    blockId: fitIdOrNull(d.blockId),
    newBlock: d.newBlock && {
      ...d.newBlock,
      name: truncate(d.newBlock.name, L.short),
      org: truncate(d.newBlock.org, L.short),
      location: truncate(d.newBlock.location, L.short),
      dates: truncate(d.newBlock.dates, L.short),
      stack: truncate(d.newBlock.stack, L.long),
    },
    name: truncate(d.name, L.short),
    title: truncate(d.title, L.short),
    bullets: fitBullets(d.bullets),
    waitingOn: fitIdOrNull(d.waitingOn),
    blockName: truncate(d.blockName, L.short),
    note: truncate(d.note, L.long),
    fromVersionId: fitIdOrNull(d.fromVersionId),
    fromVersionName: d.fromVersionName === null ? null : truncate(d.fromVersionName, L.short),
    improvedBy: improvedBy !== null && askIds.has(improvedBy) ? improvedBy : null,
    matches: fitMatches(d.matches, requirementIds),
  }
}

const fitRequirement = (r: JobRequirement): JobRequirement => ({
  ...r,
  id: fitId(r.id),
  text: truncate(r.text, L.short),
  evidence: truncate(r.evidence, L.long),
  quotes: r.quotes.filter(within(L.quote)).slice(0, L.quotes),
  keys: r.keys.filter(within(L.key)).slice(0, L.keys),
})

/**
 * `a` cut down to what the session schema accepts, so what the client receives can always be saved:
 * lists are shortened, text over its limit is cut with a trailing "…", and quotes, keys and phrases over their
 * limit are dropped (a cut quote would no longer be word for word). References to anything cut are removed.
 */
export function fitAnalysis(a: JobAnalysis): JobAnalysis {
  const requirements = a.requirements.slice(0, L.requirements).map(fitRequirement)
  const requirementIds = new Set(requirements.map((r) => r.id))
  const asks: AiAsk[] = a.asks.slice(0, L.asks).map((k) => {
    const requirementId = fitIdOrNull(k.requirementId)
    return {
      ...k,
      id: fitId(k.id),
      text: truncate(k.text, L.long),
      experienceId: fitIdOrNull(k.experienceId),
      requirementId: requirementId && !requirementIds.has(requirementId) ? null : requirementId,
    }
  })
  const askIds = new Set(asks.map((k) => k.id))
  return {
    requirements,
    asks,
    drafts: a.drafts.slice(0, L.drafts).map((d) => fitDraft(d, requirementIds, askIds)),
    reused: a.reused.slice(0, L.versions).map((v) => fitView(v, requirementIds)),
    leftOut: a.leftOut.slice(0, L.versions).map((v) => fitView(v, requirementIds)),
    report: a.report.slice(0, L.report).map((l) => ({ ...l, text: truncate(l.text, L.long) })),
    ...(a.profile ? { profile: fitProfile(a.profile, requirementIds) } : {}),
    ...(a.order ? { order: a.order.filter(within(L.blockKey)).slice(0, L.cvBlocks) } : {}),
    ...(a.roleTitles
      ? { roleTitles: a.roleTitles.filter((r) => within(L.blockKey)(r.block)).slice(0, L.cvBlocks).map((r) => ({ ...r, title: truncate(r.title, L.short) })) }
      : {}),
  }
}

/** Profile evidence within the limits; a cut phrase would no longer be word for word, so it is dropped. */
const fitProfile = (list: readonly ProfileEvidence[], requirementIds: ReadonlySet<string>): ProfileEvidence[] =>
  list
    .filter((p) => requirementIds.has(fitId(p.requirementId)))
    .slice(0, L.profile)
    .map((p) => ({
      ...p,
      requirementId: fitId(p.requirementId),
      title: truncate(p.title, L.short),
      dates: truncate(p.dates, L.short),
      detail: truncate(p.detail, L.long),
      phrases: p.phrases.filter(within(L.phrase)).slice(0, L.phrases),
    }))

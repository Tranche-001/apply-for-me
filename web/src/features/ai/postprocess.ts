// Turns validated model output into the app's result types, checking it against the real library:
// ids that don't exist are dropped (and reported), a block appears once, positions are renumbered,
// and quotes, keys and phrases are kept only when they really occur in the posting or the bullets (P1).
import type { Section } from '@prisma/client'
import { blockKey } from '../analysis/block-key'
import { fitAnalysis } from '../analysis/session'
import { cleanOrder, cleanRoleTitles, type CvBlockRef } from './cv-order'
import type { ExperienceContext, LibraryBlock, LibraryVersion, ProfileContext } from './context-types'
import { SECTIONS } from './context-types'
import { cleanProfileMatches, profileItems, withProfileStatus } from './profile-evidence'
import type { AnalysisOutput, BlockDraftOutput, CvPlanOutput } from './schemas'
import type { AiAsk, AiReportLine, AnalysisDraft, CvPlan, DraftBullet, DraftVersion, JobAnalysis, JobRequirement, RequirementMatch, VersionView } from './types'

export const MAX_BULLETS = 4
const NO_PROFILE: ProfileContext = { education: [], skills: [], achievements: [] }
const MAX_ASKS_CV = 3
const MAX_ASKS_ANALYSIS = 4

type VersionHit = { block: LibraryBlock; version: LibraryVersion }

export function indexVersions(library: LibraryBlock[]): Map<string, VersionHit> {
  const index = new Map<string, VersionHit>()
  for (const block of library) for (const version of block.versions) index.set(version.id, { block, version })
  return index
}

/** Names for the ids the model sees: a version by its name, a block or an experience by its title. */
export type IdNames = { versions: ReadonlyMap<string, string>; others: ReadonlyMap<string, string> }

export function idNames(library: LibraryBlock[], experiences: readonly { id: string; title: string }[] = []): IdNames {
  return {
    versions: new Map(library.flatMap((b) => b.versions.map((v) => [v.id, v.name] as const))),
    others: new Map([...library.map((b) => [b.id, b.name] as const), ...experiences.map((e) => [e.id, e.title] as const)]),
  }
}

// Database ids (cuid: "c" + 20-30 lowercase letters and digits, with at least one digit).
const ID = String.raw`c(?=[a-z0-9]*\d)[a-z0-9]{20,30}`
const PAREN_ID = new RegExp(String.raw`\s*\(\s*(?:version|block|experience|id)?\s*[:=#]?\s*(${ID})\s*\)`, 'gi')
const BARE_ID = new RegExp(String.raw`\b${ID}\b`, 'g')

/**
 * Text you read never shows a database id (H2): "BI Dashboard (version c…)" becomes "BI Dashboard (LLM pipeline)",
 * "Study Rats (c…)" becomes "Study Rats", a bare id becomes its name, and an unknown one is dropped.
 */
export function nameIds(text: string, names: IdNames): string {
  return text
    .replace(PAREN_ID, (_match, id: string) => (names.versions.has(id) ? ` (${names.versions.get(id)})` : ''))
    .replace(BARE_ID, (id) => names.versions.get(id) ?? names.others.get(id) ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:)])/g, '$1')
    .trim()
}

export function cleanReport(lines: AiReportLine[], names?: IdNames): AiReportLine[] {
  return lines.map((l) => ({ tag: l.tag, text: names ? nameIds(l.text, names) : l.text.trim() })).filter((l) => l.text)
}

/** Both sections exactly once, in the model's order where it gave one. */
export function normalizeSectionOrder(order: Section[]): Section[] {
  const seen = order.filter((s, i) => SECTIONS.includes(s as (typeof SECTIONS)[number]) && order.indexOf(s) === i)
  return [...seen, ...SECTIONS.filter((s) => !seen.includes(s))]
}

const MAX_HINT = 200

/**
 * Trims bullets, keeps MISSING ones as gaps, drops empty ones, caps the count. A gap is empty unless
 * `hints` is given (Job analysis): then it keeps its short hint text, ids turned into names, 200 characters at most.
 */
export function cleanBullets(bullets: DraftBullet[], hints?: IdNames): DraftBullet[] {
  return bullets
    .map((b): DraftBullet | null => {
      if (b.kind === 'MISSING') {
        const text = hints ? nameIds(b.text, hints).slice(0, MAX_HINT).trim() : ''
        return { kind: 'MISSING', text, want: b.want && b.want !== 'MISSING' ? b.want : null }
      }
      const text = b.text.trim()
      return text ? { kind: b.kind, text, want: null } : null
    })
    .filter((b): b is DraftBullet => b !== null)
    .slice(0, MAX_BULLETS)
}

function skippedNote(count: number, what: string): AiReportLine[] {
  if (!count) return []
  return [{ tag: 'NOTE', text: `Skipped ${count} ${what} the AI named that ${count === 1 ? 'is' : 'are'} not in your library.` }]
}

export function finalizeCvPlan(raw: CvPlanOutput, library: LibraryBlock[], pages: 1 | 2): CvPlan {
  const index = indexVersions(library)
  const usedBlocks = new Set<string>()
  const next: Record<Section, number> = { EXPERIENCE: 0, PROJECT: 0 }
  const items: CvPlan['items'] = []
  let unknown = 0
  for (const item of raw.items) {
    const hit = index.get(item.versionId)
    if (!hit) {
      unknown += 1
      continue
    }
    if (usedBlocks.has(hit.block.id)) continue
    usedBlocks.add(hit.block.id)
    const section = hit.block.section
    items.push({ section, position: next[section], versionId: hit.version.id })
    next[section] += 1
  }
  const asks: AiAsk[] = raw.asks
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_ASKS_CV)
    .map((text, i) => ({ id: `ask-${i + 1}`, text }))
  return {
    pages,
    sectionOrder: normalizeSectionOrder(raw.sectionOrder),
    showEducation: raw.showEducation,
    showSkills: raw.showSkills,
    showAchievements: pages === 2 ? true : raw.showAchievements,
    items,
    report: [...cleanReport(raw.report, idNames(library)), ...skippedNote(unknown, unknown === 1 ? 'version' : 'versions')],
    asks,
  }
}

// ---- Job analysis: every quote, key and phrase is checked against the real text (P1: drop, never invent) ----

const MAX_QUOTES = 3

/** The text as it is compared: straight quotes and dashes, one space for any run of whitespace. Keeps where each character came from. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i += 1) {
    let ch = text[i]
    if (/[‘’‚′]/.test(ch)) ch = "'"
    else if (/[“”„″]/.test(ch)) ch = '"'
    else if (/[‐‑‒–—―−]/.test(ch)) ch = '-'
    else if (/\s/.test(ch)) ch = ' '
    if (ch === ' ' && norm.endsWith(' ')) continue
    norm += ch
    map.push(i)
  }
  return { norm, map }
}

/** A text prepared for matching, so it is normalized once however many needles are looked up in it. */
export type PreparedText = { raw: string; norm: string; map: number[] }

export const prepareText = (raw: string): PreparedText => ({ raw, ...normalizeWithMap(raw) })

const MIN_QUOTE_CHARS = 12
const MIN_WORDING_CHARS = 3
const WORD_CHAR = /[\p{L}\p{N}]/u

type WordingOptions = { minChars?: number; wholeWords?: boolean }

/**
 * `needle` as it is written in `haystack` (same words, whitespace collapsed), or null when it does not occur there.
 * `minChars`: shorter needles never match. `wholeWords`: the characters around a match are not letters or digits,
 * so "Java" is not found inside "JavaScript" (a later occurrence that is a whole word still counts).
 */
export function findWording(haystack: string | PreparedText, needle: string, { minChars = 1, wholeWords = false }: WordingOptions = {}): string | null {
  const wanted = normalizeWithMap(needle).norm.trim()
  if (wanted.length < Math.max(1, minChars)) return null
  const { raw, norm, map } = typeof haystack === 'string' ? prepareText(haystack) : haystack
  for (let at = norm.indexOf(wanted); at >= 0; at = norm.indexOf(wanted, at + 1)) {
    const end = at + wanted.length
    if (wholeWords && (WORD_CHAR.test(norm[at - 1] ?? '') || WORD_CHAR.test(norm[end] ?? ''))) continue
    return raw.slice(map[at], map[end - 1] + 1).replace(/\s+/g, ' ')
  }
  return null
}

/** A phrase or key: 3+ characters, whole words only. */
const firstWording = (texts: readonly string[], needle: string): string | null => {
  for (const text of texts) {
    const found = findWording(text, needle, { minChars: MIN_WORDING_CHARS, wholeWords: true })
    if (found) return found
  }
  return null
}

const unique = (items: string[]): string[] => items.filter((s, i) => items.indexOf(s) === i)

/** Up to 3 sentences that really are in the posting, in the posting's own wording. */
function cleanQuotes(quotes: string[], posting: PreparedText): string[] {
  return unique(quotes.map((q) => findWording(posting, q, { minChars: MIN_QUOTE_CHARS })).filter((q): q is string => q !== null)).slice(0, MAX_QUOTES)
}

type RawRequirement = AnalysisOutput['requirements'][number]

function cleanRequirements(raw: RawRequirement[], posting: PreparedText, names: IdNames): JobRequirement[] {
  const used = new Set<string>()
  return raw
    .map((r) => ({ r, text: nameIds(r.text, names) }))
    .filter(({ text }) => text)
    .map(({ r, text }, i) => {
      let id = r.id.trim() || `r${i + 1}`
      while (used.has(id)) id = `${id}-${i + 1}`
      used.add(id)
      const quotes = cleanQuotes(r.quotes, posting)
      const keys = unique(r.keys.map((k) => firstWording(quotes, k)).filter((k): k is string => k !== null))
      return { id, text, status: r.status, evidence: nameIds(r.evidence, names), quotes, keys }
    })
}

type RawMatch = AnalysisOutput['reused'][number]['matches'][number]

/** Matches of known requirements, each phrase found word for word in one of `bullets`; a match with no phrase left is dropped. */
function cleanMatches(matches: RawMatch[], requirementIds: ReadonlySet<string>, bullets: readonly string[]): RequirementMatch[] {
  return matches.flatMap((m) => {
    const requirementId = m.requirementId.trim()
    if (!requirementIds.has(requirementId)) return []
    const phrases = unique(m.phrases.map((p) => firstWording(bullets, p)).filter((p): p is string => p !== null))
    return phrases.length ? [{ requirementId, phrases, partly: m.partly }] : []
  })
}

const bulletTexts = (bullets: readonly DraftBullet[]): string[] => bullets.filter((b) => b.kind !== 'MISSING').map((b) => b.text)

/** Unique ids; `experienceId` and `requirementId` kept only when they name something real (never a made-up id). */
function uniqueAskIds(asks: AnalysisOutput['asks'], experienceIds: ReadonlySet<string>, requirementIds: ReadonlySet<string>, names: IdNames): AiAsk[] {
  const used = new Set<string>()
  return asks
    .map((a) => ({ id: a.id.trim(), text: nameIds(a.text, names), experienceId: a.experienceId?.trim() ?? null, requirementId: a.requirementId?.trim() ?? null }))
    .filter((a) => a.text)
    .slice(0, MAX_ASKS_ANALYSIS)
    .map((a, i) => {
      let id = a.id || `q${i + 1}`
      while (used.has(id)) id = `${id}-${i + 1}`
      used.add(id)
      return {
        id,
        text: a.text,
        experienceId: a.experienceId && experienceIds.has(a.experienceId) ? a.experienceId : null,
        requirementId: a.requirementId && requirementIds.has(a.requirementId) ? a.requirementId : null,
      }
    })
}

function viewOf({ block, version }: VersionHit): VersionView {
  return {
    versionId: version.id,
    blockId: block.id,
    blockName: block.name,
    versionName: version.name,
    section: block.section,
    title: version.title,
    org: block.org,
    location: block.location,
    dates: block.dates,
    stack: block.stack,
    bullets: version.bullets.map((b) => ({ kind: b.kind, text: b.text, want: b.want })),
  }
}

type RawVersionUse = AnalysisOutput['reused'][number]

/** Library versions written out in full. Unknown ids are counted, versions already in `taken` are skipped silently. */
function collectVersions(
  items: RawVersionUse[],
  index: ReadonlyMap<string, VersionHit>,
  requirementIds: ReadonlySet<string>,
  names: IdNames,
  taken: Set<string>,
): { views: (VersionView & { why: string; matches: RequirementMatch[] })[]; unknown: number } {
  const views: (VersionView & { why: string; matches: RequirementMatch[] })[] = []
  let unknown = 0
  for (const item of items) {
    const hit = index.get(item.versionId)
    if (!hit) {
      unknown += 1
      continue
    }
    if (taken.has(hit.version.id)) continue
    taken.add(hit.version.id)
    const view = viewOf(hit)
    views.push({ ...view, why: nameIds(item.why, names), matches: cleanMatches(item.matches, requirementIds, bulletTexts(view.bullets)) })
  }
  return { views, unknown }
}

/**
 * `postingText` is the saved posting: quotes are kept only when they occur in it. Phrases are kept only when they
 * occur in the bullets they claim to come from; ids (requirements, questions, versions) must exist, else they are dropped.
 */
export function finalizeAnalysis(
  raw: AnalysisOutput,
  library: LibraryBlock[],
  jobName: string,
  experiences: readonly { id: string; title: string }[] = [],
  postingText = '',
  profile: ProfileContext = NO_PROFILE,
  /** The job's role: a recommended role title may not be more senior than it. */
  jobRole = '',
): JobAnalysis {
  const index = indexVersions(library)
  const blocks = new Map(library.map((b) => [b.id, b]))
  const names = idNames(library, experiences)
  const cleaned = cleanRequirements(raw.requirements, prepareText(postingText), names)
  const requirementIds = new Set(cleaned.map((r) => r.id))
  // His profile counts as evidence: a requirement it shows in full is covered, even with no block for it.
  const profileEvidence = cleanProfileMatches(raw.profileMatches ?? [], profileItems(profile), requirementIds)
  const requirements = withProfileStatus(cleaned, profileEvidence)
  const asks = uniqueAskIds(raw.asks, new Set(experiences.map((e) => e.id)), requirementIds, names)
  const askIds = new Set(asks.map((a) => a.id))
  let unknownBlocks = 0

  const drafts: AnalysisDraft[] = []
  raw.drafts.forEach((d, i) => {
    const block = d.blockId ? blocks.get(d.blockId) : undefined
    // A blockId that names no block of the library is a mistake, even when the draft also carries a newBlock.
    if (d.blockId && !block) {
      unknownBlocks += 1
      return
    }
    const newBlock = block ? null : d.newBlock && d.newBlock.name.trim() ? { ...d.newBlock, name: d.newBlock.name.trim() } : null
    if (!block && !newBlock) {
      unknownBlocks += 1
      return
    }
    const bullets = cleanBullets(d.bullets, names)
    const from = block && d.fromVersionId ? block.versions.find((v) => v.id === d.fromVersionId) : undefined
    const improvedBy = d.improvedBy?.trim() ?? ''
    drafts.push({
      key: `d${i + 1}`,
      blockId: block ? block.id : null,
      newBlock,
      blockName: block ? block.name : newBlock!.name,
      // A version made for a job takes the job's name; a new block starts as its Base.
      name: block ? jobName : 'Base',
      title: d.title.trim(),
      bullets,
      waitingOn: null,
      note: nameIds(d.note, names),
      fromVersionId: from ? from.id : null,
      fromVersionName: from ? from.name : null,
      improvedBy: askIds.has(improvedBy) ? improvedBy : null,
      matches: cleanMatches(d.matches, requirementIds, bulletTexts(bullets)),
    })
  })

  // A version is reused or left out, never both: reused wins.
  const taken = new Set<string>()
  const reused = collectVersions(raw.reused, index, requirementIds, names, taken)
  const leftOut = collectVersions(raw.leftOut, index, requirementIds, names, taken)
  const unknownVersions = reused.unknown + leftOut.unknown
  const cv = cvBlockRefs(drafts, reused.views, blocks)

  // Last: whatever the model sent, what the client receives also passes the session schema (it is saved as is).
  return fitAnalysis({
    requirements,
    asks,
    drafts,
    reused: reused.views,
    leftOut: leftOut.views,
    report: [
      ...cleanReport(raw.report, names),
      ...skippedNote(unknownBlocks, unknownBlocks === 1 ? 'block' : 'blocks'),
      ...skippedNote(unknownVersions, unknownVersions === 1 ? 'version' : 'versions'),
    ],
    profile: profileEvidence,
    order: cleanOrder(raw.order ?? [], cv),
    roleTitles: cleanRoleTitles(raw.roleTitles ?? [], cv, jobRole),
  })
}

/** The blocks this CV is made of: each draft (keyed like the review step keys it) and each version used as it is. */
function cvBlockRefs(drafts: readonly AnalysisDraft[], reused: readonly VersionView[], blocks: ReadonlyMap<string, LibraryBlock>): CvBlockRef[] {
  return [
    ...drafts.map((d) => ({ key: blockKey(d), section: d.newBlock?.section ?? blocks.get(d.blockId ?? '')?.section ?? 'PROJECT', name: d.blockName, versionId: null })),
    ...reused.map((v) => ({ key: v.blockId, section: v.section, name: v.blockName, versionId: v.versionId })),
  ]
}

export function finalizeBlockDraft(raw: BlockDraftOutput, library: LibraryBlock[], experience: ExperienceContext): DraftVersion {
  const linked = library.find((b) => b.id === raw.blockId && experience.blockIds.includes(b.id))
  const bullets = cleanBullets(raw.bullets)
  const title = raw.title.trim()
  if (linked) {
    const name = raw.name.trim()
    return {
      blockId: linked.id,
      newBlock: null,
      name: name && name.toLowerCase() !== 'base' ? name : 'From your notes',
      title,
      bullets,
      waitingOn: null,
    }
  }
  // A new block: what the model read from the notes, else the experience's own fields (never invented).
  const nb = raw.newBlock
  return {
    blockId: null,
    newBlock: {
      name: nb?.name.trim() || experience.title.trim() || 'Untitled block',
      section: nb?.section ?? 'EXPERIENCE',
      org: nb?.org.trim() || experience.where.trim(),
      location: nb?.location.trim() ?? '',
      dates: nb?.dates.trim() || experience.when.trim(),
      stack: nb?.stack.trim() ?? '',
    },
    name: 'Base',
    title,
    bullets,
    waitingOn: null,
  }
}

/** Analysis as the fixed `analyzePosting` contract sees it: covered means fully covered. */
export function toPostingSummary(a: JobAnalysis) {
  return {
    requirements: a.requirements.map((r) => ({ text: r.text, covered: r.status === 'covered' })),
    asks: a.asks,
    drafts: a.drafts.map(({ blockId, newBlock, name, title, bullets, waitingOn }): DraftVersion => ({ blockId, newBlock, name, title, bullets, waitingOn })),
    report: a.report,
  }
}

// Turns validated model output into the app's result types, checking it against the real library:
// ids that don't exist are dropped (and reported), a block appears once, positions are renumbered,
// and a draft that waits on a question carries no text (P1).
import type { Section } from '@prisma/client'
import type { ExperienceContext, LibraryBlock, LibraryVersion } from './context-types'
import { SECTIONS } from './context-types'
import type { AnalysisOutput, BlockDraftOutput, CvPlanOutput } from './schemas'
import type { AiAsk, AiReportLine, AnalysisDraft, CvPlan, DraftBullet, DraftVersion, JobAnalysis, ReusedVersion } from './types'

export const MAX_BULLETS = 4
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

/** Trims bullets, keeps MISSING ones as empty gaps, drops empty ones, caps the count. */
export function cleanBullets(bullets: DraftBullet[]): DraftBullet[] {
  return bullets
    .map((b): DraftBullet | null => {
      if (b.kind === 'MISSING') return { kind: 'MISSING', text: '', want: b.want && b.want !== 'MISSING' ? b.want : null }
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

/** Unique ids; `experienceId` kept only when it names one of your experiences (never a made-up id). */
function uniqueAskIds(asks: AnalysisOutput['asks'], experienceIds: ReadonlySet<string>, names: IdNames): AiAsk[] {
  const used = new Set<string>()
  return asks
    .map((a) => ({ id: a.id.trim(), text: nameIds(a.text, names), experienceId: a.experienceId?.trim() ?? null }))
    .filter((a) => a.text)
    .slice(0, MAX_ASKS_ANALYSIS)
    .map((a, i) => {
      let id = a.id || `q${i + 1}`
      while (used.has(id)) id = `${id}-${i + 1}`
      used.add(id)
      return { id, text: a.text, experienceId: a.experienceId && experienceIds.has(a.experienceId) ? a.experienceId : null }
    })
}

export function finalizeAnalysis(
  raw: AnalysisOutput,
  library: LibraryBlock[],
  jobName: string,
  experiences: readonly { id: string; title: string }[] = [],
): JobAnalysis {
  const index = indexVersions(library)
  const blocks = new Map(library.map((b) => [b.id, b]))
  const names = idNames(library, experiences)
  const asks = uniqueAskIds(raw.asks, new Set(experiences.map((e) => e.id)), names)
  let unknownBlocks = 0

  const drafts: AnalysisDraft[] = []
  raw.drafts.forEach((d, i) => {
    const block = d.blockId ? blocks.get(d.blockId) : undefined
    const newBlock = block ? null : d.newBlock && d.newBlock.name.trim() ? { ...d.newBlock, name: d.newBlock.name.trim() } : null
    if (!block && !newBlock) {
      unknownBlocks += 1
      return
    }
    const waitingOn = d.waitingOn?.trim() || null
    drafts.push({
      key: `d${i + 1}`,
      blockId: block ? block.id : null,
      newBlock,
      blockName: block ? block.name : newBlock!.name,
      // A version made for a job takes the job's name; a new block starts as its Base.
      name: block ? jobName : 'Base',
      title: d.title.trim(),
      bullets: waitingOn ? [] : cleanBullets(d.bullets),
      waitingOn,
      note: nameIds(d.note, names),
    })
  })

  const seen = new Set<string>()
  const reused: ReusedVersion[] = []
  let unknownVersions = 0
  for (const r of raw.reused) {
    const hit = index.get(r.versionId)
    if (!hit) {
      unknownVersions += 1
      continue
    }
    if (seen.has(hit.version.id)) continue
    seen.add(hit.version.id)
    reused.push({ versionId: hit.version.id, blockName: hit.block.name, versionName: hit.version.name, why: nameIds(r.why, names) })
  }

  return {
    requirements: raw.requirements
      .map((r) => ({ text: nameIds(r.text, names), status: r.status, evidence: nameIds(r.evidence, names) }))
      .filter((r) => r.text),
    asks,
    drafts,
    reused,
    report: [
      ...cleanReport(raw.report, names),
      ...skippedNote(unknownBlocks, unknownBlocks === 1 ? 'block' : 'blocks'),
      ...skippedNote(unknownVersions, unknownVersions === 1 ? 'version' : 'versions'),
    ],
  }
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
      org: nb?.org.trim() ?? experience.where.trim(),
      location: nb?.location.trim() ?? '',
      dates: nb?.dates.trim() ?? experience.when.trim(),
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

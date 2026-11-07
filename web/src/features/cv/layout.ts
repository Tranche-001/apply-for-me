// The CV page model, ported from the approved design (Compose.dc.html): how tall each part of the CV
// is on the 680 px preview page, how the CV flows onto pages, and how full the last page is.
// Pure functions only, so the preview, the fit warning and the tests all agree.
import type { BulletKind, Section } from '@prisma/client'
import type { ProfileData } from '../profile/types'

/**
 * Page model in preview pixels. The preview page is 680 px wide (8.5 in at 80 px/in), so 11 px text is
 * about 10 pt on paper. Heights mirror the CSS of the preview (see components/cv-preview.tsx).
 */
export const METRICS = {
  cap: 824, // 880 px page height minus 2 × 28 px padding
  line: 14.52, // bullet line: 11 px × 1.32
  cpl: 108, // characters per bullet line
  titleCpl: 100, // characters per project heading line
  header: 52, // name + contact + gap
  eduEntry: 36, // degree + school lines
  secHead: 23.5, // section heading + gap
  secGap: 9, // gap between sections
  skillLine: 15.95, // 11 px × 1.45
  achRow: 50.2, // a row of two items, title + two-line description
} as const

const ENTRY_GAP = 5
const HEADING_LINE = 16.2 // 12 px × 1.35
const META_LINE = 14.9 // 11 px × 1.35
/** A shorter version must save at least this share of a line to be worth suggesting. */
const MIN_SAVING_LINES = 0.9
const MAX_SUGGESTIONS = 3

export const SECTION_NAMES: Record<Section, string> = {
  EXPERIENCE: 'Experience',
  PROJECT: 'AI & Automation Projects',
}

/** The parts of a block's heading that never change between versions. */
export type PrintBlock = {
  id: string
  name: string
  section: Section
  org: string
  location: string
  dates: string
  stack: string
}

export type PrintBullet = { kind: BulletKind; text: string }
export type PrintVersion = { id: string; name: string; title: string; bullets: PrintBullet[] }

/** One block as it lands on the page. `peeked` marks a version shown on hover, not chosen yet. */
export type LayoutEntry = { key: string; block: PrintBlock; version: PrintVersion; peeked: boolean }
export type LayoutSectionInput = { section: Section; entries: LayoutEntry[] }
export type ProfileShown = { showEducation: boolean; showSkills: boolean; showAchievements: boolean }

export type PageSection =
  | { kind: 'edu'; heading: true }
  | { kind: 'entries'; section: Section; heading: boolean; entries: LayoutEntry[] }
  | { kind: 'skills'; heading: true }
  | { kind: 'ach'; heading: true }

export type CvPage = { sections: PageSection[] }

export type CvLayout = {
  pages: CvPage[]
  /** Height used on the last page. */
  lastUsed: number
  /** Height of the whole CV, as if it were one long page. */
  total: number
  /** Name of the first thing pushed past the page limit, '' when it fits. */
  spill: string
}

export type LayoutInput = {
  pageLimit: number
  /** Sections in print order; an empty one is left off the CV. */
  sections: LayoutSectionInput[]
  profile: ProfileData
  show: ProfileShown
}

export function lineCount(text: string, perLine: number): number {
  return Math.max(1, Math.ceil(text.length / perLine))
}

/** Gaps (MISSING bullets) are never printed (P1). */
export function printedBullets(version: PrintVersion): PrintBullet[] {
  return version.bullets.filter((b) => b.kind !== 'MISSING')
}

export function entryHeight(block: PrintBlock, version: PrintVersion): number {
  const bullets = printedBullets(version)
  const bodyLines = bullets.reduce((n, b) => n + lineCount(b.text, METRICS.cpl), 0)
  const body = bullets.length ? 2 + bodyLines * METRICS.line + (bullets.length - 1) : 0
  if (block.section === 'PROJECT') {
    const titleLines = lineCount(`${version.title} | ${block.stack}`, METRICS.titleCpl)
    return 4 + HEADING_LINE * titleLines + 1 + body + ENTRY_GAP
  }
  return 4 + HEADING_LINE + 1 + META_LINE + 1 + body + ENTRY_GAP
}

/** Height of each profile section on the page; 0 when it is off for this CV or empty. */
export function profileHeights(profile: ProfileData, show: ProfileShown): { edu: number; skills: number; ach: number } {
  const skillLines = profile.skills.reduce((n, x) => n + lineCount(`${x.label}: ${x.text}`, METRICS.cpl), 0)
  return {
    edu: show.showEducation && profile.education.length ? METRICS.secHead + profile.education.length * METRICS.eduEntry + METRICS.secGap : 0,
    skills: show.showSkills && profile.skills.length ? METRICS.secHead + skillLines * METRICS.skillLine + METRICS.secGap : 0,
    ach:
      show.showAchievements && profile.achievements.length
        ? METRICS.secHead + Math.ceil(profile.achievements.length / 2) * METRICS.achRow + METRICS.secGap
        : 0,
  }
}

/**
 * Flow the CV onto pages. A block never splits; a section that continues on the next page has no
 * heading; an empty section is left off. Pages past the limit are still drawn, so you see what spills.
 */
export function layoutCv(input: LayoutInput): CvLayout {
  const pages: CvPage[] = []
  let used = 0
  let spill = ''
  const heights = profileHeights(input.profile, input.show)

  const current = (): CvPage => pages[pages.length - 1]
  const newPage = (label: string) => {
    pages.push({ sections: [] })
    used = 0
    if (pages.length === input.pageLimit + 1 && !spill) spill = label
  }
  // Each placement returns the page it landed on; nothing is mutated after it is returned.
  const place = (section: PageSection, height: number, label: string, forceNewSection: boolean) => {
    if (used + height > METRICS.cap && used > 0) newPage(label)
    const page = current()
    const last = page.sections[page.sections.length - 1]
    if (!forceNewSection && section.kind === 'entries' && last && last.kind === 'entries' && last.section === section.section) {
      page.sections[page.sections.length - 1] = { ...last, entries: [...last.entries, ...section.entries] }
    } else {
      page.sections.push(section)
    }
    used += height
  }

  newPage('')
  let total = METRICS.header + heights.edu
  used = total
  if (heights.edu) current().sections.push({ kind: 'edu', heading: true })

  for (const sec of input.sections) {
    if (!sec.entries.length) continue
    sec.entries.forEach((entry, idx) => {
      const height = entryHeight(entry.block, entry.version) + (idx === 0 ? METRICS.secHead : 0)
      const before = pages.length
      if (used + height > METRICS.cap && used > 0) newPage(entry.block.name)
      const brokePage = pages.length !== before
      place({ kind: 'entries', section: sec.section, heading: idx === 0, entries: [entry] }, height, entry.block.name, idx === 0 || brokePage)
      total += height
    })
    used += METRICS.secGap
    total += METRICS.secGap
  }

  const fixed = (kind: 'skills' | 'ach', height: number, label: string) => {
    if (!height) return
    place({ kind, heading: true }, height, label, true)
    total += height
  }
  fixed('skills', heights.skills, 'Technical Skills')
  fixed('ach', heights.ach, 'Leadership & Achievements')

  return { pages, lastUsed: used, total, spill }
}

export type Fit = {
  pageCount: number
  limit: number
  over: boolean
  /** How full the last page is, 0–100. */
  pct: number
  /** Height past the limit, in px (≤ 0 when the overflow is only a block that didn't fit). */
  excess: number
  excessLines: number
  spill: string
}

export function fitOf(layout: CvLayout, limit: number): Fit {
  const pageCount = layout.pages.length
  const excess = layout.total - limit * METRICS.cap
  return {
    pageCount,
    limit,
    over: pageCount > limit,
    pct: Math.min(100, Math.round((layout.lastUsed / METRICS.cap) * 100)),
    excess,
    excessLines: Math.max(1, Math.round(excess / METRICS.line)),
    spill: layout.spill,
  }
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** The words of the fit warning: a title ("Too long for 1 page") and one line of detail. */
export function describeFit(fit: Fit): { title: string; detail: string } {
  if (fit.over) {
    const tail =
      fit.excess > 0
        ? `About ${plural(fit.excessLines, 'line')} too long.`
        : `It doesn’t fit in the space left on page ${fit.limit}.`
    return { title: `Too long for ${plural(fit.limit, 'page')}`, detail: `${fit.spill} spills onto page ${fit.limit + 1}. ${tail}` }
  }
  const title = `Fits on ${plural(fit.pageCount, 'page')}`
  if (fit.pageCount < fit.limit) {
    return {
      title,
      detail: `Page ${fit.pageCount} is ${fit.pct}% full, and you allow ${plural(fit.limit, 'page')}, so there is room for more.`,
    }
  }
  return { title, detail: `Page ${fit.pageCount} is ${fit.pct}% full.` }
}

/** Label above each preview page: "Page 1 of 1 · 83% full", or a warning past the limit. */
export function pageLabel(index: number, fit: Fit): { text: string; beyond: boolean } {
  if (index >= fit.limit) return { text: `Page ${index + 1} · over your ${plural(fit.limit, 'page')} limit`, beyond: true }
  const shown = Math.min(fit.pageCount, fit.limit)
  const full = !fit.over && index === fit.pageCount - 1 ? ` · ${fit.pct}% full` : ''
  return { text: `Page ${index + 1} of ${shown}${full}`, beyond: false }
}

export type ShorterOption = { blockId: string; blockName: string; version: PrintVersion; save: number; lines: number }

/**
 * Shorter versions to make the CV fit: for each block, its version that saves the most height
 * (at least about a line), best savings first, at most three (P3: reuse before cutting).
 */
export function shorterVersions(
  rows: { block: PrintBlock; current: PrintVersion; versions: PrintVersion[] }[],
  max: number = MAX_SUGGESTIONS,
): ShorterOption[] {
  const found = rows.flatMap((row) => {
    const currentHeight = entryHeight(row.block, row.current)
    const best = row.versions
      .filter((v) => v.id !== row.current.id)
      .map((v) => ({ v, save: currentHeight - entryHeight(row.block, v) }))
      .filter((x) => x.save >= METRICS.line * MIN_SAVING_LINES)
      .reduce<{ v: PrintVersion; save: number } | null>((acc, x) => (!acc || x.save > acc.save ? x : acc), null)
    return best
      ? [{ blockId: row.block.id, blockName: row.block.name, version: best.v, save: best.save, lines: Math.max(1, Math.round(best.save / METRICS.line)) }]
      : []
  })
  return [...found].sort((a, b) => b.save - a.save).slice(0, max)
}

/** Lines that leaving Leadership & Achievements out would save. */
export function achievementLines(profile: ProfileData): number {
  const h = profileHeights(profile, { showEducation: false, showSkills: false, showAchievements: true }).ach
  return Math.round(h / METRICS.line)
}

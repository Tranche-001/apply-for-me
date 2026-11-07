// Library helpers shared by Compose and the Blocks screen: what you just saved on top of the server's
// copy, search by title / company / job, and the theme filter.
import type { LibBlock, LibVersion } from './types'

/** What this screen wrote and the server copy may not show yet; it wins until the page reloads. */
export type LibraryOverlay = {
  blocks: LibBlock[]
  versions: LibVersion[]
  removed: string[]
  /** Block ids in the order you set, or null. */
  order: string[] | null
}

export const EMPTY_OVERLAY: LibraryOverlay = { blocks: [], versions: [], removed: [], order: null }

export function applyOverlay(base: readonly LibBlock[], o: LibraryOverlay): LibBlock[] {
  const known = new Set(base.map((b) => b.id))
  const all = [...base, ...o.blocks.filter((b) => !known.has(b.id))]
  const merged = all.map((b) => {
    const mine = o.versions.filter((v) => v.blockId === b.id)
    if (!mine.length && !b.versions.some((v) => o.removed.includes(v.id))) return b
    const replaced = b.versions.map((v) => mine.find((m) => m.id === v.id) ?? v)
    const added = mine.filter((m) => !b.versions.some((v) => v.id === m.id))
    const versions = [...replaced, ...added].filter((v) => !o.removed.includes(v.id))
    return { ...b, versions }
  })
  if (!o.order) return merged
  const rank = new Map(o.order.map((id, i) => [id, i]))
  return [...merged].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER))
}

/** Add or replace versions in the overlay (newest copy wins). */
export function withVersions(o: LibraryOverlay, versions: LibVersion[]): LibraryOverlay {
  const ids = new Set(versions.map((v) => v.id))
  return { ...o, versions: [...o.versions.filter((v) => !ids.has(v.id)), ...versions] }
}

export type ThemeMode = 'any' | 'all'

export type VersionFilter = { query: string; themes: string[]; mode: ThemeMode; jobLabels: Record<string, string> }

/** A version matches by theme (any / all), then by its name, title, bullets, block, company or job. */
export function versionMatches(block: LibBlock, v: LibVersion, f: VersionFilter): boolean {
  const has = (t: string) => v.themes.includes(t)
  const themeOk = f.themes.length === 0 || (f.mode === 'all' ? f.themes.every(has) : f.themes.some(has))
  if (!themeOk) return false
  const q = f.query.trim().toLowerCase()
  if (!q) return true
  const hay = [block.name, block.org, block.stack, v.name, v.title, ...v.jobIds.map((id) => f.jobLabels[id] ?? ''), ...v.bullets.map((b) => b.text)].join(' ').toLowerCase()
  return hay.includes(q)
}

/** Themes with how many versions use each, most used first. */
export function themeCounts(library: readonly LibBlock[]): { theme: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const v of library.flatMap((b) => b.versions)) for (const t of v.themes) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].map(([theme, count]) => ({ theme, count })).sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme))
}

/** Compose's "Add blocks" search: name, context, titles and themes. */
export function blockMatches(block: LibBlock, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [block.name, block.org, block.location, block.dates, block.stack, ...block.versions.map((v) => `${v.title} ${v.themes.join(' ')}`)].join(' ').toLowerCase()
  return hay.includes(q)
}

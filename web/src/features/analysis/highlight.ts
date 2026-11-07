// Pure text helpers for Job analysis: marking words inside text, and finding a quote in the saved posting.

export type Segment = { text: string; mark: boolean }

/**
 * Splits `text` into plain and marked pieces. Each phrase is matched exactly (case sensitive) at its first
 * occurrence; ranges are taken earliest first and a range that overlaps an earlier one is dropped.
 */
export function markSegments(text: string, phrases: readonly string[]): Segment[] {
  if (!text) return []
  const ranges = phrases
    .map((p) => {
      const i = p ? text.indexOf(p) : -1
      return i < 0 ? null : { start: i, end: i + p.length }
    })
    .filter((r): r is { start: number; end: number } => r !== null)
    .sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let at = 0
  for (const { start, end } of ranges) {
    if (start < at) continue
    if (start > at) out.push({ text: text.slice(at, start), mark: false })
    out.push({ text: text.slice(start, end), mark: true })
    at = end
  }
  if (at < text.length) out.push({ text: text.slice(at), mark: false })
  return out
}

export function hasMark(segments: readonly Segment[]): boolean {
  return segments.some((s) => s.mark)
}

const BULLET_GLYPH = /^[\s•·▪◦●○■□‣⁃*\-–—]+/

/** The saved posting as display lines: trimmed, bullet glyphs removed, empty lines dropped. */
export function postingLines(postingText: string): string[] {
  return postingText
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET_GLYPH, '').trim())
    .filter(Boolean)
}

const LIST_MARK = /^\s*[•·▪◦●○■□‣⁃*\-–—]/

/** For each of postingLines(), whether the posting marked it as a list item ("- " from a fetched <li>, "• "…). */
export function postingListItems(postingText: string): boolean[] {
  return postingText
    .split(/\r?\n/)
    .filter((line) => line.replace(BULLET_GLYPH, '').trim())
    .map((line) => LIST_MARK.test(line))
}

function normalize(text: string): string {
  return text
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Index of the first line containing the quote (whitespace and curly quotes ignored); -1 when none. */
export function findQuoteLine(lines: readonly string[], quote: string): number {
  const wanted = normalize(quote)
  if (!wanted) return -1
  return lines.findIndex((line) => normalize(line).includes(wanted))
}

export type QuoteContext = { before: string | null; line: string; after: string | null }

/** The line holding the quote, with the line before and after (grey context on screen). */
/** A short line with no sentence ending reads as a heading ("Requirements", "What you will do:"). */
const looksLikeHeading = (line: string): boolean => {
  const t = line.trim()
  return t.length > 0 && t.length <= 60 && !/[.!?;,]$/.test(t) && t.split(/\s+/).length <= 8
}

/** The section a posting line sits in: the nearest heading above it (without its colon), or null. */
export function sectionTitle(lines: readonly string[], index: number): string | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (looksLikeHeading(lines[i])) return lines[i].trim().replace(/:$/, '').trim()
  }
  return null
}

export function quoteContext(lines: readonly string[], quote: string): QuoteContext | null {
  const i = findQuoteLine(lines, quote)
  if (i < 0) return null
  // Context stays inside the quote's section: a heading above or below is not shown as context.
  const near = (j: number): string | null => (lines[j] !== undefined && !looksLikeHeading(lines[j]) ? lines[j] : null)
  return { before: near(i - 1), line: lines[i], after: near(i + 1) }
}

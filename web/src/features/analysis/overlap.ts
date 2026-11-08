// Do the links typed for one job hold the same posting? Pure and server-agnostic (the start card uses linkLabel too).
// Two career pages of the same job (a program page and its job page) repeat most of their lines; the user then
// decides "Same job" or "Different jobs" before the AI is asked anything (H3, H5).

/** Share of the shorter text's lines found in the other from which the links look like the same job. */
export const OVERLAP_THRESHOLD = 0.6
/** A line counts when it says something: menus, buttons and single words do not. */
const MIN_LINE_CHARS = 20
const MIN_LINE_WORDS = 3
/** Fewer real lines than this is too little to call two texts the same. */
const MIN_LINES = 3

export type LinkText = { url: string; text: string }

/** A line as it is compared: no accents, lower case, letters and digits only, single spaces. */
const normalizeLine = (line: string): string =>
  line
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function lineSet(text: string): Set<string> {
  const lines = text.split('\n').map(normalizeLine)
  return new Set(lines.filter((l) => l.length >= MIN_LINE_CHARS && l.split(' ').length >= MIN_LINE_WORDS))
}

/** Share (0–1) of the lines of the text with fewer lines that are also in the other; 0 when either has too few lines. */
export function overlapShare(a: string, b: string): number {
  const [small, big] = [lineSet(a), lineSet(b)].sort((x, y) => x.size - y.size)
  if (small.size < MIN_LINES) return 0
  let shared = 0
  for (const line of small) if (big.has(line)) shared += 1
  return shared / small.size
}

const longestIndex = (links: readonly LinkText[]): number => links.reduce((best, l, i) => (l.text.length > links[best].text.length ? i : best), 0)

/**
 * The lowest share between the longest text and each other one, when every link repeats the longest one enough to
 * look like the same job; null for fewer than 2 links or when any link looks different.
 */
export function sameJobShare(links: readonly LinkText[]): number | null {
  if (links.length < 2) return null
  const longest = longestIndex(links)
  const shares = links.filter((_, i) => i !== longest).map((l) => overlapShare(l.text, links[longest].text))
  const lowest = Math.min(...shares)
  return lowest >= OVERLAP_THRESHOLD ? lowest : null
}

/** "Same job": one copy of the text, the longest one (it holds the most of the posting). */
export const keepOneCopy = (links: readonly LinkText[]): string => links[longestIndex(links)]?.text ?? ''

/** "carreiras.ifood.com.br/gen-ai/": host and path, as the overlap card names a link. */
export function linkLabel(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname
    return `${u.hostname.replace(/^www\./, '')}${path}`
  } catch {
    return url
  }
}

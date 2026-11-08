// Pure helpers of the start card and the start flow: the links typed, and the notice for links that could not be read.
import { linkLabel } from '../overlap'

export const MAX_LINKS = 5

/** The links typed: trimmed, in order, empty rows ignored. */
export const typedLinks = (rows: string[]): string[] => rows.map((r) => r.trim()).filter(Boolean)

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// ---- "These links look like the same job" (next-ideas mockup, #same-job) ----

const listOf = (items: string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

export const overlapHeading = (count: number): string => `These ${count} links look like the same job.`

/** Which links, and how much of their text repeats (the shorter page's lines found in the other). */
export const overlapReason = (urls: string[], share: number): string =>
  `${listOf(urls.map(linkLabel))} share most of their text (${Math.round(share * 100)}% of the lines are the same).`

/** The line under "Same job / Different jobs", following the choice. */
export const sameJobNote = (same: boolean, count: number): string =>
  same
    ? `The app keeps one copy of the text and continues. ${count === 2 ? 'Both links are' : `All ${count} links are`} saved on the job.`
    : `The app keeps ${count === 2 ? 'both texts' : 'the texts'} apart and shows “Which job?” so you pick one.`

/** Where the text came from (same as StartSource in ../start-types). */
type Source = 'link' | 'links' | 'text'

const HOLDER: Record<Source, string> = { link: 'This link has', links: 'These links have', text: 'This text has' }

/** The status line while "Which job?" is open. */
export const splitNotice = (count: number, source: Source = 'link', tracks = false): string =>
  `${tracks ? `This posting has ${count} tracks.` : `${HOLDER[source]} ${count} job postings.`} Pick the one to analyze; the AI compares only that one with your blocks.`

/** The "Which job?" heading and the line under it. */
export function splitHeading(count: number, source: Source, tracks: boolean): { title: string; sub: string } {
  if (tracks) return { title: `This posting has ${count} tracks.`, sub: 'Pick the one to analyze. Each keeps the program’s shared part.' }
  return { title: `${HOLDER[source]} ${count} jobs`, sub: 'The AI split what it read into the jobs it found, each with its own text. Pick the one to analyze now.' }
}

/** One sentence per link that could not be read, then what the analysis uses. `total` is the number of links typed. */
export function unreadNotice(unread: { url: string; error: string }[], total: number): string | null {
  if (!unread.length) return null
  const lines = unread.map((u) => `Couldn’t read ${hostOf(u.url)}: ${u.error}`)
  const others = total - unread.length
  return [...lines, `The analysis uses the other ${others === 1 ? 'link' : 'links'}.`].join(' ')
}

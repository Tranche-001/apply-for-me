// Pure helpers of the start card and the start flow: the links typed, and the notice for links that could not be read.
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

/** The status line while "Which job?" is open. */
export const splitNotice = (count: number): string => `This link has ${count} job postings. Pick the one to analyze; the AI compares only that one with your blocks.`

/** One sentence per link that could not be read, then what the analysis uses. `total` is the number of links typed. */
export function unreadNotice(unread: { url: string; error: string }[], total: number): string | null {
  if (!unread.length) return null
  const lines = unread.map((u) => `Couldn’t read ${hostOf(u.url)}: ${u.error}`)
  const others = total - unread.length
  return [...lines, `The analysis uses the other ${others === 1 ? 'link' : 'links'}.`].join(' ')
}

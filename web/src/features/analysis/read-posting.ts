// Reads one posting link for Job analysis: checked, fetched with the SSRF guards, cut to the posting limit.
// Failures carry the plain-language message (a blocked site tells him to paste the text instead).
import { fetchPosting, type FetchResult } from './fetch-posting'
import { MAX_POSTING_CHARS } from './html-text'
import { checkUrl, URL_ERRORS } from './url-guard'

export type PostingRead = { ok: true; url: string; title: string | null; text: string; truncated: boolean } | { ok: false; error: string }

const PASTE_HINT = 'You can paste the job text instead.'

export async function readPostingUrl(raw: string, fetcher: (url: string) => Promise<FetchResult> = fetchPosting): Promise<PostingRead> {
  const check = checkUrl(raw)
  if (!check.ok) return { ok: false, error: check.error }
  const url = check.url.toString()
  const result = await fetcher(url)
  if (!result.ok) return { ok: false, error: /paste/i.test(result.message) ? result.message : `${result.message} ${PASTE_HINT}` }
  const text = result.text.slice(0, MAX_POSTING_CHARS)
  return { ok: true, url, title: result.title, text, truncated: result.truncated || text.length < result.text.length }
}

export type PostingUrlsRead =
  | { ok: true; text: string; title: string | null; urls: string[]; unread: { url: string; error: string }[] }
  | { ok: false; error: string }

/**
 * Reads every link of one job in parallel. Links are checked and de-duplicated first (an invalid one is an error
 * naming it). Links that can't be read are listed in `unread`; the text comes from the others. If none can be read
 * the first failure's message is the error.
 */
export async function readPostingUrls(raws: string[], fetcher: (url: string) => Promise<FetchResult> = fetchPosting): Promise<PostingUrlsRead> {
  const urls: string[] = []
  for (const raw of raws) {
    const check = checkUrl(raw)
    if (!check.ok) return { ok: false, error: `${raw.trim()}: ${check.error}` }
    const url = check.url.toString()
    if (!urls.includes(url)) urls.push(url)
  }
  if (!urls.length) return { ok: false, error: URL_ERRORS.empty }
  const reads = await Promise.all(urls.map((url) => readPostingUrl(url, fetcher)))
  const read = reads.flatMap((r) => (r.ok ? [r] : []))
  const unread = reads.flatMap((r, i) => (r.ok ? [] : [{ url: urls[i], error: r.error }]))
  if (!read.length) return { ok: false, error: unread[0].error }
  const combined = read.length === 1 ? read[0].text : read.map((r) => `From ${r.url}:\n${r.text}`).join('\n\n')
  return { ok: true, text: combined.slice(0, MAX_POSTING_CHARS), title: read[0].title, urls, unread }
}

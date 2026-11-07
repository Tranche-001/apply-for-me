// Reads one posting link for Job analysis: checked, fetched with the SSRF guards, cut to the posting limit.
// Failures carry the plain-language message (a blocked site tells him to paste the text instead).
import { fetchPosting, type FetchResult } from './fetch-posting'
import { MAX_POSTING_CHARS } from './html-text'
import { checkUrl } from './url-guard'

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

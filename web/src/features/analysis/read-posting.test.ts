// readPostingUrls with a fake fetcher: no network.
import { describe, expect, test, vi } from 'vitest'
import type { FetchResult } from './fetch-posting'
import { MAX_POSTING_CHARS } from './html-text'
import { readPostingUrls } from './read-posting'

const A = 'https://jobs.example.com/a'
const B = 'https://apply.example.com/b'
const good = (url: string, text: string, title: string | null = `Title ${text}`): FetchResult => ({ ok: true, url, title, text, truncated: false })
const blocked = (message = 'This site doesn’t let apps read it. You can paste the job text instead.'): FetchResult => ({ ok: false, reason: 'blocked', message })
const fake = (map: Record<string, FetchResult>) => vi.fn(async (url: string) => map[url] ?? blocked('Not found.'))

describe('readPostingUrls', () => {
  test('one link: its text as is, its title, the link', async () => {
    const r = await readPostingUrls([A], fake({ [A]: good(A, 'posting text') }))
    expect(r).toEqual({ ok: true, text: 'posting text', title: 'Title posting text', urls: [A], unread: [] })
  })

  test('two links both read: From blocks in the order typed, first title', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: good(A, 'one'), [B]: good(B, 'two') }))
    expect(r).toEqual({ ok: true, text: `From ${A}:\none\n\nFrom ${B}:\ntwo`, title: 'Title one', urls: [A, B], unread: [] })
  })

  test('one of two blocked: text from the other, the blocked one listed, both links kept', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: blocked('Blocked. You can paste the job text instead.'), [B]: good(B, 'two') }))
    expect(r).toEqual({ ok: true, text: 'two', title: 'Title two', urls: [A, B], unread: [{ url: A, error: 'Blocked. You can paste the job text instead.' }] })
  })

  test('all blocked: the first failure message', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: blocked('First. Paste the text.'), [B]: blocked('Second. Paste the text.') }))
    expect(r).toEqual({ ok: false, error: 'First. Paste the text.' })
  })

  test('duplicates (after normalisation) are read once', async () => {
    const fetcher = fake({ [A]: good(A, 'one') })
    const r = await readPostingUrls([A, ` ${A} `, 'HTTPS://JOBS.EXAMPLE.COM/a'], fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(r.ok && r.urls).toEqual([A])
  })

  test('an invalid link is an error naming that link; nothing is fetched', async () => {
    const fetcher = fake({ [A]: good(A, 'one') })
    const r = await readPostingUrls([A, 'http://localhost/x'], fetcher)
    expect(r).toEqual({ ok: false, error: expect.stringContaining('http://localhost/x') })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('no links is an error', async () => {
    expect((await readPostingUrls([], fake({}))).ok).toBe(false)
  })

  test('the combined text is cut to the posting limit', async () => {
    const big = 'x'.repeat(MAX_POSTING_CHARS)
    const r = await readPostingUrls([A, B], fake({ [A]: good(A, big), [B]: good(B, big) }))
    expect(r.ok && r.text.length).toBe(MAX_POSTING_CHARS)
  })

  test('the title is the first successful read, even when it is null', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: good(A, 'one', null), [B]: good(B, 'two') }))
    expect(r.ok && r.title).toBeNull()
  })
})

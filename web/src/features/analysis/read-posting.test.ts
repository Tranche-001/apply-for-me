// readPostingUrls with a fake fetcher: no network.
import { describe, expect, test, vi } from 'vitest'
import type { FetchResult } from './fetch-posting'
import { MAX_POSTING_CHARS } from './html-text'
import { readPostingUrl, readPostingUrls } from './read-posting'
import type { RenderResult } from './render-posting'

const A = 'https://jobs.example.com/a'
const B = 'https://apply.example.com/b'
const good = (url: string, text: string, title: string | null = `Title ${text}`): FetchResult => ({ ok: true, url, title, text, truncated: false })
const blocked = (message = 'This site doesn’t let apps read it. You can paste the job text instead.'): FetchResult => ({ ok: false, reason: 'blocked', message })
const fake = (map: Record<string, FetchResult>) => vi.fn(async (url: string) => map[url] ?? blocked('Not found.'))

describe('readPostingUrls', () => {
  test('one link: its text as is, its title, the link', async () => {
    const r = await readPostingUrls([A], fake({ [A]: good(A, 'posting text') }))
    expect(r).toEqual({ ok: true, text: 'posting text', title: 'Title posting text', urls: [A], unread: [], reads: [{ url: A, text: 'posting text' }] })
  })

  test('two links both read: From blocks in the order typed, first title', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: good(A, 'one'), [B]: good(B, 'two') }))
    expect(r).toEqual({
      ok: true,
      text: `From ${A}:\none\n\nFrom ${B}:\ntwo`,
      title: 'Title one',
      urls: [A, B],
      unread: [],
      reads: [
        { url: A, text: 'one' },
        { url: B, text: 'two' },
      ],
    })
  })

  test('one of two blocked: text from the other, the blocked one listed, both links kept', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: blocked('Blocked. You can paste the job text instead.'), [B]: good(B, 'two') }))
    expect(r).toEqual({ ok: true, text: 'two', title: 'Title two', urls: [A, B], unread: [{ url: A, error: 'Blocked. You can paste the job text instead.' }], reads: [{ url: B, text: 'two' }] })
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

describe('headless-browser fallback', () => {
  const noText = (): FetchResult => ({
    ok: false,
    reason: 'no-text',
    message: 'jobs.example.com didn’t show the job text to the app (it may need a login or JavaScript). Paste the job text instead.',
  })
  const rendered = (text: string): RenderResult => ({ ok: true, url: A, title: 'Rendered title', text })
  const longText = 'Senior engineer role. '.repeat(30)

  test('taken when the plain read found no job text; returns the rendered text', async () => {
    const renderer = vi.fn(async () => rendered(longText))
    const r = await readPostingUrl(A, fake({ [A]: noText() }), renderer)
    expect(renderer).toHaveBeenCalledWith(A)
    expect(r).toEqual({ ok: true, url: A, title: 'Rendered title', text: longText, truncated: false })
  })

  test('rendered text is cut to the posting limit and flagged truncated', async () => {
    const r = await readPostingUrl(A, fake({ [A]: noText() }), async () => rendered('y'.repeat(MAX_POSTING_CHARS + 5)))
    expect(r.ok && r.text.length).toBe(MAX_POSTING_CHARS)
    expect(r.ok && r.truncated).toBe(true)
  })

  test.each([
    ['blocked (login, bot check, 403)', blocked()],
    ['not found', { ok: false, reason: 'not-found', message: 'This page doesn’t exist anymore.' } as FetchResult],
    ['timeout', { ok: false, reason: 'timeout', message: 'Took more than 10 seconds.' } as FetchResult],
    ['not allowed', { ok: false, reason: 'not-allowed', message: 'Local.' } as FetchResult],
    ['network', { ok: false, reason: 'network', message: 'Couldn’t read it.' } as FetchResult],
  ])('not taken for %s', async (_name, failure) => {
    const renderer = vi.fn(async () => rendered(longText))
    const r = await readPostingUrl(A, fake({ [A]: failure }), renderer)
    expect(renderer).not.toHaveBeenCalled()
    expect(r.ok).toBe(false)
  })

  test('not taken when the plain read worked', async () => {
    const renderer = vi.fn(async () => rendered(longText))
    await readPostingUrl(A, fake({ [A]: good(A, 'plain') }), renderer)
    expect(renderer).not.toHaveBeenCalled()
  })

  test('renderer failure keeps the plain-language message', async () => {
    const original = noText()
    const r = await readPostingUrl(A, fake({ [A]: original }), async () => ({ ok: false, reason: 'timeout', message: 'internal detail' }))
    expect(r).toEqual({ ok: false, error: original.ok ? '' : original.message })
  })

  test('no browser keeps the plain-language message', async () => {
    const original = noText()
    const r = await readPostingUrl(A, fake({ [A]: original }), async () => ({ ok: false, reason: 'no-browser', message: 'none' }))
    expect(r).toEqual({ ok: false, error: original.ok ? '' : original.message })
  })

  test('renderer that throws keeps the plain-language message', async () => {
    const original = noText()
    const r = await readPostingUrl(A, fake({ [A]: original }), async () => {
      throw new Error('boom')
    })
    expect(r).toEqual({ ok: false, error: original.ok ? '' : original.message })
  })

  test('rendered text that is still too short or a wall keeps the message', async () => {
    const original = noText()
    const msg = original.ok ? '' : original.message
    expect(await readPostingUrl(A, fake({ [A]: original }), async () => rendered('iFood GEN AI'))).toEqual({ ok: false, error: msg })
    expect(await readPostingUrl(A, fake({ [A]: original }), async () => rendered(`Please enable JavaScript. ${'x'.repeat(300)}`))).toEqual({
      ok: false,
      error: msg,
    })
  })

  test('readPostingUrls uses the fallback per link', async () => {
    const r = await readPostingUrls([A, B], fake({ [A]: noText(), [B]: good(B, 'plain') }), async () => rendered(longText))
    expect(r.ok && r.text).toBe(`From ${A}:\n${longText}\n\nFrom ${B}:\nplain`)
  })
})

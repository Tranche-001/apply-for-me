// decideRequest: the allow/deny decision for every request the headless page makes. No browser, no network.
import { describe, expect, test } from 'vitest'
import { decideRequest, postingBrowserPath, type RenderGuardDeps } from './render-guard'

describe('postingBrowserPath', () => {
  test('the env variable wins', () => {
    expect(postingBrowserPath({ POSTING_BROWSER_PATH: ' /opt/chrome ' }, () => true)).toBe('/opt/chrome')
  })
  test('else the first existing candidate, in order', () => {
    expect(postingBrowserPath({}, (p) => p !== '/usr/bin/chromium-browser')).toBe('/usr/bin/chromium')
    expect(postingBrowserPath({}, (p) => p === '/usr/bin/google-chrome')).toBe('/usr/bin/google-chrome')
  })
  test('none found is null, and a blank variable is ignored', () => {
    expect(postingBrowserPath({ POSTING_BROWSER_PATH: '  ' }, () => false)).toBeNull()
  })
})

const resolver = (map: Record<string, string[]>): RenderGuardDeps => ({
  resolve: async (host) => {
    const found = map[host]
    if (!found) throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' })
    return found.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  },
})

const deps = resolver({
  'jobs.example.com': ['93.184.216.34'],
  'mixed.example.com': ['93.184.216.34', '10.0.0.5'],
  'internal.example.com': ['192.168.1.10'],
  'v6.example.com': ['2606:2800:220:1:248:1893:25c8:1946'],
  'meta.example.com': ['169.254.169.254'],
})

describe('decideRequest', () => {
  test('allows a document on a public host', async () => {
    expect(await decideRequest('https://jobs.example.com/a', 'document', deps)).toEqual({ allow: true })
  })

  test('allows scripts and XHR/fetch on public hosts and an IPv6 public host', async () => {
    expect(await decideRequest('https://jobs.example.com/app.js', 'script', deps)).toEqual({ allow: true })
    expect(await decideRequest('https://jobs.example.com/api', 'fetch', deps)).toEqual({ allow: true })
    expect(await decideRequest('https://v6.example.com/', 'xhr', deps)).toEqual({ allow: true })
  })

  test.each(['image', 'font', 'media', 'websocket'])('aborts %s requests to save time', async (type) => {
    expect(await decideRequest('https://jobs.example.com/x', type, deps)).toEqual({ allow: false, reason: 'skipped-type' })
  })

  test.each(['file:///etc/passwd', 'ftp://jobs.example.com/x', 'data:text/html,hi', 'chrome://version', 'ws://jobs.example.com/'])(
    'refuses non-http(s) scheme %s',
    async (url) => {
      expect((await decideRequest(url, 'document', deps)).allow).toBe(false)
    },
  )

  test('refuses ports other than 80/443', async () => {
    expect(await decideRequest('https://jobs.example.com:8443/', 'document', deps)).toEqual({ allow: false, reason: 'not-allowed' })
    expect(await decideRequest('http://jobs.example.com:22/', 'xhr', deps)).toEqual({ allow: false, reason: 'not-allowed' })
  })

  test('refuses literal private, loopback and metadata addresses and local names', async () => {
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://10.1.2.3/', 'http://localhost/', 'http://db/']) {
      expect(await decideRequest(url, 'fetch', deps)).toEqual({ allow: false, reason: 'not-allowed' })
    }
  })

  test('refuses a name that resolves to a private address', async () => {
    expect(await decideRequest('https://internal.example.com/', 'document', deps)).toEqual({ allow: false, reason: 'not-allowed' })
    expect(await decideRequest('https://meta.example.com/', 'fetch', deps)).toEqual({ allow: false, reason: 'not-allowed' })
  })

  test('refuses when ANY resolved address is private', async () => {
    expect(await decideRequest('https://mixed.example.com/', 'document', deps)).toEqual({ allow: false, reason: 'not-allowed' })
  })

  test('refuses when the name does not resolve or resolves to nothing', async () => {
    expect(await decideRequest('https://missing.example.com/', 'document', deps)).toEqual({ allow: false, reason: 'not-allowed' })
    expect(await decideRequest('https://empty.example.com/', 'document', resolver({ 'empty.example.com': [] }))).toEqual({
      allow: false,
      reason: 'not-allowed',
    })
  })

  test('refuses an unparsable url', async () => {
    expect((await decideRequest('not a url', 'document', deps)).allow).toBe(false)
  })
})

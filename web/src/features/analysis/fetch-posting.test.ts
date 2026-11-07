// The reader against a local test server. Tests swap the DNS resolver and the address check so the
// server on 127.0.0.1 is reachable under a fake name; one test keeps the real check to prove it refuses.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { DEFAULT_DEPS, fetchPosting, guardedLookup, type FetchDeps } from './fetch-posting'
import { isBlockedAddress, URL_ERRORS } from './url-guard'

const POSTING = `<html><body><h1>GenAI Engineer</h1><p>${'Python em produção, RAG e avaliação de modelos. '.repeat(20)}</p></body></html>`

let server: http.Server
let port = 0

beforeAll(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/job':
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(POSTING)
        return
      case '/gzip':
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' })
        res.end(gzipSync(POSTING))
        return
      case '/redirect':
        res.writeHead(302, { Location: '/job' })
        res.end()
        return
      case '/to-metadata':
        res.writeHead(301, { Location: 'http://169.254.169.254/latest/meta-data' })
        res.end()
        return
      case '/loop':
        res.writeHead(302, { Location: '/loop' })
        res.end()
        return
      case '/huge':
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('a'.repeat(2 * 1024 * 1024))
        return
      case '/pdf':
        res.writeHead(200, { 'Content-Type': 'application/pdf' })
        res.end('%PDF-1.7')
        return
      case '/forbidden':
        res.writeHead(403, { 'Content-Type': 'text/html' })
        res.end('no')
        return
      case '/gone':
        res.writeHead(404)
        res.end()
        return
      case '/slow':
        setTimeout(() => res.end(POSTING), 2_000)
        return
      default:
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<p>Sign in</p>')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

/** Test deps: "jobs.test" resolves to the local server, which the address check lets through. */
function deps(over: Partial<FetchDeps> = {}): FetchDeps {
  return {
    ...DEFAULT_DEPS,
    resolve: async () => [{ address: '127.0.0.1', family: 4 }],
    isBlocked: (ip) => ip !== '127.0.0.1' && isBlockedAddress(ip),
    allowedPorts: new Set(['', '80', '443', String(port)]),
    ...over,
  }
}

const url = (path: string) => `http://jobs.test:${port}${path}`

describe('fetchPosting', () => {
  test('reads a page and returns its text', async () => {
    const res = await fetchPosting(url('/job'), deps())
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.text.startsWith('GenAI Engineer')).toBe(true)
      expect(res.truncated).toBe(false)
    }
  })

  test('decompresses gzip and follows a same-site redirect', async () => {
    expect((await fetchPosting(url('/gzip'), deps())).ok).toBe(true)
    const redirected = await fetchPosting(url('/redirect'), deps())
    expect(redirected.ok && redirected.url).toBe(url('/job'))
  })

  test('re-checks every redirect: a hop to the metadata address is refused', async () => {
    expect(await fetchPosting(url('/to-metadata'), deps())).toMatchObject({ ok: false, reason: 'not-allowed', message: URL_ERRORS.local })
  })

  test('stops after 3 redirects', async () => {
    expect(await fetchPosting(url('/loop'), deps())).toMatchObject({ ok: false, reason: 'network' })
  })

  test('refuses more than the size cap, files that are not pages, and says when a site blocks reading', async () => {
    expect(await fetchPosting(url('/huge'), deps())).toMatchObject({ ok: false, reason: 'too-large' })
    expect(await fetchPosting(url('/pdf'), deps())).toMatchObject({ ok: false, reason: 'not-text' })
    expect(await fetchPosting(url('/forbidden'), deps())).toMatchObject({ ok: false, reason: 'blocked' })
    expect(await fetchPosting(url('/gone'), deps())).toMatchObject({ ok: false, reason: 'not-found' })
    expect(await fetchPosting(url('/wall'), deps())).toMatchObject({ ok: false, reason: 'blocked' })
  })

  test('gives up after the timeout', async () => {
    expect(await fetchPosting(url('/slow'), deps({ timeoutMs: 300 }))).toMatchObject({ ok: false, reason: 'timeout' })
  })

  test('with the real address check, a name that resolves to 127.0.0.1 is refused at connect time', async () => {
    const res = await fetchPosting(url('/job'), deps({ isBlocked: isBlockedAddress }))
    expect(res).toMatchObject({ ok: false, reason: 'not-allowed', message: URL_ERRORS.local })
  })
})

describe('guardedLookup', () => {
  test('refuses when any resolved address is private, even if another one is public', async () => {
    const lookup = guardedLookup({
      resolve: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ],
      isBlocked: isBlockedAddress,
    })
    const err = await new Promise<Error | null>((resolve) => lookup('rebind.test', { all: true }, (e) => resolve(e)))
    expect(err?.message).toBe(URL_ERRORS.local)
  })

  test('passes public addresses through in both callback shapes', async () => {
    const lookup = guardedLookup({ resolve: async () => [{ address: '93.184.216.34', family: 4 }], isBlocked: isBlockedAddress })
    const all = await new Promise<unknown>((resolve) => lookup('ok.test', { all: true }, (_e, a) => resolve(a)))
    expect(all).toEqual([{ address: '93.184.216.34', family: 4 }])
    const one = await new Promise<unknown>((resolve) => lookup('ok.test', {}, (_e, a) => resolve(a)))
    expect(one).toBe('93.184.216.34')
  })
})

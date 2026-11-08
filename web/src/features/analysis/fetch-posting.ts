// Reads a job posting from a link, on the server, with SSRF guards:
// - the link passes checkUrl (http/https, standard ports, no credentials, no local names or IPs)
// - the connection resolves DNS through a guarded lookup: every address is checked and a private,
//   loopback, link-local or reserved one aborts the request, so DNS rebinding can't slip past
// - redirects are followed by hand (at most 3) and every hop is checked again
// - 10 s for the whole read, 1 MB at most (after decompression), web pages and plain text only
// When a site won't let apps read it (LinkedIn often doesn't), the result says so and the screen
// offers "Paste the job text".
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import type { Readable, Transform } from 'node:stream'
import { extractPosting, looksBlocked } from './html-text'
import { checkUrl, DEFAULT_PORTS, isBlockedAddress, URL_ERRORS } from './url-guard'

export const FETCH_TIMEOUT_MS = 10_000
export const MAX_BYTES = 1024 * 1024
export const MAX_REDIRECTS = 3

export type FetchFailure = 'not-allowed' | 'blocked' | 'not-found' | 'timeout' | 'too-large' | 'not-text' | 'network' | 'no-text'

export type FetchResult =
  | { ok: true; url: string; title: string | null; text: string; truncated: boolean }
  | { ok: false; reason: FetchFailure; message: string }

export type FetchDeps = {
  resolve: (hostname: string) => Promise<LookupAddress[]>
  isBlocked: (address: string) => boolean
  allowedPorts: ReadonlySet<string>
  timeoutMs: number
  maxBytes: number
}

const defaultResolve = (hostname: string) =>
  new Promise<LookupAddress[]>((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
  )

export const DEFAULT_DEPS: FetchDeps = {
  resolve: defaultResolve,
  isBlocked: isBlockedAddress,
  allowedPorts: DEFAULT_PORTS,
  timeoutMs: FETCH_TIMEOUT_MS,
  maxBytes: MAX_BYTES,
}

class GuardError extends Error {
  constructor(
    readonly reason: FetchFailure,
    message: string,
  ) {
    super(message)
    this.name = 'GuardError'
  }
}

const TEXT_TYPES = /^(text\/html|text\/plain|application\/xhtml\+xml|application\/xml|text\/xml)\b/i

/** A dns.lookup replacement that refuses blocked addresses; used by the socket at connect time. */
export function guardedLookup(deps: Pick<FetchDeps, 'resolve' | 'isBlocked'>): LookupFunction {
  return (hostname, options, callback) => {
    deps.resolve(hostname).then(
      (addresses) => {
        const wanted = options.family === 4 || options.family === 6 ? addresses.filter((a) => a.family === options.family) : addresses
        if (!wanted.length) {
          callback(Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }), '', 0)
          return
        }
        if (wanted.some((a) => deps.isBlocked(a.address))) {
          callback(new GuardError('not-allowed', URL_ERRORS.local), '', 0)
          return
        }
        if (options.all) (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, wanted)
        else callback(null, wanted[0].address, wanted[0].family)
      },
      (err: NodeJS.ErrnoException) => callback(err, '', 0),
    )
  }
}

type RawResponse = { status: number; location: string | null; contentType: string; body: string }

function decoderFor(encoding: string | undefined): Transform | null {
  switch ((encoding ?? '').trim().toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return createGunzip()
    case 'deflate':
      return createInflate()
    case 'br':
      return createBrotliDecompress()
    default:
      return null
  }
}

function charsetOf(contentType: string): string {
  const m = contentType.match(/charset\s*=\s*"?([\w-]+)/i)
  return m ? m[1].toLowerCase() : 'utf-8'
}

function decodeBody(chunks: Buffer[], contentType: string): string {
  const buffer = Buffer.concat(chunks)
  try {
    return new TextDecoder(charsetOf(contentType)).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function requestOnce(url: URL, deps: FetchDeps, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http
    const req = mod.request(
      url,
      {
        method: 'GET',
        signal,
        lookup: guardedLookup(deps),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; apply-for-me/1.0; reads one job posting for its owner)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const contentType = String(res.headers['content-type'] ?? '')
        const location = typeof res.headers.location === 'string' ? res.headers.location : null
        if ((status >= 300 && status < 400) || status >= 400) {
          res.resume()
          resolve({ status, location, contentType, body: '' })
          return
        }
        if (contentType && !TEXT_TYPES.test(contentType)) {
          res.resume()
          const kind = contentType.split(';')[0].trim()
          reject(new GuardError('not-text', `This link is a file (${kind}), not a web page. Paste the job text instead.`))
          return
        }
        const declared = Number(res.headers['content-length'] ?? 0)
        if (declared > deps.maxBytes) {
          res.destroy()
          reject(new GuardError('too-large', 'This page is too large to read (over 1 MB). Paste the job text instead.'))
          return
        }
        const decoder = decoderFor(res.headers['content-encoding'])
        const stream: Readable = decoder ? res.pipe(decoder) : res
        const chunks: Buffer[] = []
        let size = 0
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > deps.maxBytes) {
            res.destroy()
            decoder?.destroy()
            reject(new GuardError('too-large', 'This page is too large to read (over 1 MB). Paste the job text instead.'))
            return
          }
          chunks.push(chunk)
        })
        stream.on('end', () => resolve({ status, location, contentType, body: decodeBody(chunks, contentType) }))
        stream.on('error', (err) => reject(err))
        res.on('error', (err) => reject(err))
      },
    )
    req.on('error', (err) => reject(err))
    req.end()
  })
}

function blockedMessage(host: string): string {
  return `${host} doesn’t let apps read its pages (LinkedIn often does this). Paste the job text instead.`
}

function failureFor(err: unknown, host: string): FetchResult {
  if (err instanceof GuardError) return { ok: false, reason: err.reason, message: err.message }
  const e = err as NodeJS.ErrnoException
  if (e?.name === 'AbortError' || e?.code === 'ABORT_ERR') {
    return { ok: false, reason: 'timeout', message: `${host} took more than 10 seconds to answer. Try again, or paste the job text.` }
  }
  if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN') {
    return { ok: false, reason: 'network', message: `Couldn’t find ${host}. Check the link, or paste the job text.` }
  }
  return { ok: false, reason: 'network', message: `Couldn’t read ${host}. Check the link, or paste the job text.` }
}

/** Fetches one posting link and returns its readable text, or a plain-language reason it couldn't. */
export async function fetchPosting(rawUrl: string, deps: FetchDeps = DEFAULT_DEPS): Promise<FetchResult> {
  const first = checkUrl(rawUrl, deps.allowedPorts)
  if (!first.ok) return { ok: false, reason: 'not-allowed', message: first.error }
  let url = first.url
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const res = await requestOnce(url, deps, controller.signal)
      if (res.status >= 300 && res.status < 400) {
        if (!res.location || hop === MAX_REDIRECTS) {
          return { ok: false, reason: 'network', message: `${url.hostname} kept redirecting. Paste the job text instead.` }
        }
        const next = checkUrl(new URL(res.location, url).toString(), deps.allowedPorts)
        if (!next.ok) return { ok: false, reason: 'not-allowed', message: next.error }
        url = next.url
        continue
      }
      if (res.status === 404 || res.status === 410) {
        return { ok: false, reason: 'not-found', message: 'This page doesn’t exist anymore. The posting may have closed; paste the job text if you have it.' }
      }
      if ([401, 403, 407, 429, 451, 999].includes(res.status)) return { ok: false, reason: 'blocked', message: blockedMessage(url.hostname) }
      if (res.status >= 400) {
        return { ok: false, reason: 'network', message: `${url.hostname} answered with an error (${res.status}). Try again, or paste the job text.` }
      }
      const extracted = extractPosting(res.body, res.contentType)
      if (looksBlocked(extracted.text, url.toString())) {
        return {
          ok: false,
          reason: 'no-text',
          message: `${url.hostname} didn’t show the job text to the app (it may need a login or JavaScript). Paste the job text instead.`,
        }
      }
      return { ok: true, url: url.toString(), title: extracted.title, text: extracted.text, truncated: extracted.truncated }
    }
    return { ok: false, reason: 'network', message: `${url.hostname} kept redirecting. Paste the job text instead.` }
  } catch (err) {
    return failureFor(err, url.hostname)
  } finally {
    clearTimeout(timer)
  }
}

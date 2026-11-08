// Allow/deny decision for every request the headless browser makes while rendering a posting (SSRF guard).
// Pure apart from the injected DNS resolver, so it is unit-tested without a browser.
import { existsSync } from 'node:fs'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { checkUrl, isBlockedAddress } from './url-guard'

export type RenderGuardDeps = { resolve: (hostname: string) => Promise<LookupAddress[]> }
export type RequestDecision = { allow: true } | { allow: false; reason: 'skipped-type' | 'not-allowed' }

/** Resource types the reader never needs; aborted to save time. */
const SKIPPED_TYPES: ReadonlySet<string> = new Set(['image', 'font', 'media', 'websocket'])

const BROWSER_CANDIDATES = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome']

/** POSTING_BROWSER_PATH, else the first Chromium/Chrome found in the usual places, else null. */
export function postingBrowserPath(env: Record<string, string | undefined> = process.env, exists: (p: string) => boolean = existsSync): string | null {
  const configured = env.POSTING_BROWSER_PATH?.trim()
  if (configured) return configured
  return BROWSER_CANDIDATES.find((p) => exists(p)) ?? null
}

export const defaultRenderGuardDeps: RenderGuardDeps = {
  resolve: (hostname) =>
    new Promise<LookupAddress[]>((resolve, reject) =>
      dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
    ),
}

/** Decides one request: only http(s) on ports 80/443, and a host that resolves only to public addresses. */
export async function decideRequest(rawUrl: string, resourceType: string, deps: RenderGuardDeps = defaultRenderGuardDeps): Promise<RequestDecision> {
  const check = checkUrl(rawUrl)
  if (!check.ok) return { allow: false, reason: 'not-allowed' }
  if (SKIPPED_TYPES.has(resourceType)) return { allow: false, reason: 'skipped-type' }
  const host = check.url.hostname.replace(/^\[|\]$/g, '')
  try {
    const addresses = await deps.resolve(host)
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) return { allow: false, reason: 'not-allowed' }
    return { allow: true }
  } catch {
    return { allow: false, reason: 'not-allowed' }
  }
}

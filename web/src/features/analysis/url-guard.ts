// SSRF guard for reading a job posting from a link the user typed. Pure checks, unit-tested:
// - only http and https, no user:password@, only the standard ports (80, 443)
// - no localhost / .local / .internal / single-label names
// - no address in a private, loopback, link-local, shared, multicast or reserved range (IPv4 and IPv6,
//   including IPv4 hidden inside IPv6). fetch-posting.ts runs the address check again on every address
//   DNS returns, at connect time, so a name that resolves to a private address is refused too.
import { BlockList, isIP } from 'node:net'

export const DEFAULT_PORTS: ReadonlySet<string> = new Set(['', '80', '443'])

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string }

export const URL_ERRORS = {
  empty: 'Paste a link to the job posting.',
  invalid: 'That doesn’t look like a web link. Copy the address from your browser’s address bar.',
  protocol: 'Only http and https links can be read.',
  credentials: 'Links with a user name or password in them can’t be read.',
  port: 'Only links on the standard web ports can be read.',
  local: 'This link points to your own computer or local network, so it can’t be read.',
} as const

const IPV4_RANGES: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
]

const IPV6_RANGES: [string, number][] = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0:0', 96], // SIIT (IPv4-translated)
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
]

const blockedV4 = new BlockList()
for (const [net, prefix] of IPV4_RANGES) blockedV4.addSubnet(net, prefix, 'ipv4')
const blockedV6 = new BlockList()
for (const [net, prefix] of IPV6_RANGES) blockedV6.addSubnet(net, prefix, 'ipv6')

/** The 8 16-bit groups of an IPv6 address (handles "::" and a trailing dotted IPv4), or null. */
export function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted) {
    if (isIP(dotted[1]) !== 4) return null
    const [a, b, c, d] = dotted[1].split('.').map(Number)
    s = s.slice(0, -dotted[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part ? part.split(':') : [])
  const head = parse(halves[0])
  const tail = halves.length === 2 ? parse(halves[1]) : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0) return null
  const groups = [...head, ...Array<string>(fill).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

/** IPv4 carried inside IPv6 (mapped ::ffff:a.b.c.d, compatible ::a.b.c.d, NAT64 64:ff9b::/96). */
export function embeddedIPv4(groups: number[]): string | null {
  const zeros = (from: number, to: number) => groups.slice(from, to).every((g) => g === 0)
  const mapped = zeros(0, 5) && groups[5] === 0xffff
  const nat64 = groups[0] === 0x64 && groups[1] === 0xff9b && zeros(2, 6)
  const compatible = zeros(0, 6) && (groups[6] !== 0 || groups[7] > 1)
  if (!mapped && !nat64 && !compatible) return null
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.')
}

/** True when the address must never be fetched from the server. Unknown formats count as blocked. */
export function isBlockedAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, '')
  const family = isIP(bare.split('%')[0])
  if (family === 4) return blockedV4.check(bare, 'ipv4')
  if (family !== 6) return true
  const groups = ipv6Groups(bare)
  if (!groups) return true
  const v4 = embeddedIPv4(groups)
  if (v4) return blockedV4.check(v4, 'ipv4')
  const canonical = groups.map((g) => g.toString(16)).join(':')
  return blockedV6.check(canonical, 'ipv6')
}

function isLocalName(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.lan') ||
    !host.includes('.')
  )
}

/** Validates a typed link before any network access. A bare "site.com/path" is read as https. */
export function checkUrl(raw: string, allowedPorts: ReadonlySet<string> = DEFAULT_PORTS): UrlCheck {
  const text = raw.trim()
  if (!text) return { ok: false, error: URL_ERRORS.empty }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, error: URL_ERRORS.invalid }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: URL_ERRORS.protocol }
  if (url.username || url.password) return { ok: false, error: URL_ERRORS.credentials }
  if (!allowedPorts.has(url.port)) return { ok: false, error: URL_ERRORS.port }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return { ok: false, error: URL_ERRORS.invalid }
  const literal = host.replace(/^\[|\]$/g, '')
  if (isIP(literal)) {
    if (isBlockedAddress(literal)) return { ok: false, error: URL_ERRORS.local }
  } else if (isLocalName(host)) {
    return { ok: false, error: URL_ERRORS.local }
  }
  url.hash = ''
  return { ok: true, url }
}

import 'server-only'
// The API address saved with an OpenAI-compatible key: the server sends your key there, so it must be a public
// https address. Reuses the job-posting SSRF guard (no localhost, .internal, single-label names or private,
// loopback, link-local ranges) and also checks every address the name resolves to.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { checkUrl, isBlockedAddress } from '../analysis/url-guard'

const NOT_PUBLIC = 'This API address can’t be used: it must be the service’s public https address, not a local or private one.'

/** A plain-language problem with the address, or null when it is a public https address. */
export async function publicAddressProblem(raw: string): Promise<string | null> {
  if (!raw.trim().toLowerCase().startsWith('https://')) return 'The API address must start with https://.'
  // The posting guard's messages talk about reading a link; here any refusal means the same thing.
  const checked = checkUrl(raw)
  if (!checked.ok) return NOT_PUBLIC
  const host = checked.url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) return isBlockedAddress(host) ? NOT_PUBLIC : null
  try {
    const addresses = await lookup(host, { all: true, verbatim: true })
    if (!addresses.length || addresses.some((a) => isBlockedAddress(a.address))) return NOT_PUBLIC
  } catch {
    return `Couldn’t find ${host}. Check the API address.`
  }
  return null
}

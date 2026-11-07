// Turns a fetched job page into plain text the AI can read. Pure, unit-tested.
// Prefers the page's schema.org JobPosting (most job boards embed one); otherwise strips the HTML.

export const MAX_POSTING_CHARS = 40_000
/** Less readable text than this usually means a login wall or a page drawn by JavaScript. */
export const MIN_POSTING_CHARS = 200

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó',
  ocirc: 'ô', otilde: 'õ', uacute: 'ú', uuml: 'ü', ccedil: 'ç', Aacute: 'Á', Agrave: 'À', Acirc: 'Â',
  Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú',
  Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED[body] ?? whole
  })
}

function tidy(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Readable text of an HTML fragment or page: no scripts, styles or tags; blocks become lines. */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|footer)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|ul|ol|tr|table|header|main|blockquote)\s*>/gi, '\n')
    .replace(/<(p|div|section|article|h[1-6]|ul|ol|tr|table|header|main|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return tidy(decodeEntities(stripped)).replace(/\n{2,}/g, '\n')
}

export function pageTitle(html: string): string | null {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const title = m ? tidy(decodeEntities(m[1].replace(/<[^>]+>/g, ' '))) : ''
  return title || null
}

type JsonObject = Record<string, unknown>

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function findJobPosting(node: unknown): JsonObject | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findJobPosting(item)
      if (hit) return hit
    }
    return null
  }
  if (!isObject(node)) return null
  const type = node['@type']
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return node
  return findJobPosting(node['@graph'] ?? null)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** The schema.org JobPosting embedded as JSON-LD, as text, or null when the page has none. */
export function jobPostingFromJsonLd(html: string): { title: string; text: string } | null {
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const match of scripts) {
    let data: unknown
    try {
      data = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const posting = findJobPosting(data)
    if (!posting) continue
    const title = str(posting.title).trim()
    const org = isObject(posting.hiringOrganization) ? str(posting.hiringOrganization.name).trim() : ''
    const description = htmlToText(decodeEntities(str(posting.description)))
    const extras = [str(posting.employmentType), str(posting.datePosted)].filter(Boolean).join(' · ')
    const text = tidy([title, org, extras, description].filter(Boolean).join('\n'))
    if (description) return { title: title || org, text }
  }
  return null
}

export type ExtractedPosting = { title: string | null; text: string; truncated: boolean }

export function extractPosting(html: string, contentType: string): ExtractedPosting {
  const isHtml = /html|xml/i.test(contentType) || /<html|<body|<div|<p\b/i.test(html.slice(0, 2000))
  let title: string | null = null
  let text: string
  if (isHtml) {
    const fromLd = jobPostingFromJsonLd(html)
    title = fromLd?.title || pageTitle(html)
    text = fromLd && fromLd.text.length >= MIN_POSTING_CHARS ? fromLd.text : htmlToText(html)
  } else {
    text = tidy(html)
  }
  const truncated = text.length > MAX_POSTING_CHARS
  return { title, text: truncated ? text.slice(0, MAX_POSTING_CHARS) : text, truncated }
}

const WALL_HINTS = [/sign in to (view|see|continue)/i, /join linkedin/i, /authwall/i, /enable javascript/i, /captcha/i, /are you a robot/i, /access denied/i]

/** True when what came back is a login wall, a bot check, or too little text to be the posting. */
export function looksBlocked(text: string, finalUrl: string): boolean {
  if (/linkedin\.com\/(authwall|login|uas\/login|checkpoint)/i.test(finalUrl)) return true
  if (text.length < MIN_POSTING_CHARS) return true
  return text.length < 1500 && WALL_HINTS.some((re) => re.test(text))
}

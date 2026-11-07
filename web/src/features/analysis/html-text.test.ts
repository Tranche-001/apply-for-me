import { describe, expect, test } from 'vitest'
import { decodeEntities, extractPosting, htmlToText, jobPostingFromJsonLd, looksBlocked, MAX_POSTING_CHARS, pageTitle } from './html-text'

const long = (s: string) => s.repeat(30)

describe('htmlToText', () => {
  test('drops scripts, styles and tags, keeps lines and list items', () => {
    const html = `<html><head><title>T</title><style>p{}</style></head><body><script>alert(1)</script>
      <h1>Engenheiro de IA</h1><p>Requisitos:</p><ul><li>Python</li><li>RAG &amp; embeddings</li></ul><p>Vaga&nbsp;remota<br>São Paulo</p></body></html>`
    expect(htmlToText(html)).toBe('Engenheiro de IA\nRequisitos:\n- Python\n- RAG & embeddings\nVaga remota\nSão Paulo')
  })

  test('decodes named and numeric entities, including Portuguese accents', () => {
    expect(decodeEntities('a&ccedil;&atilde;o &#233; &#x2014; &unknown;')).toBe('ação é — &unknown;')
  })

  test('reads the page title', () => {
    expect(pageTitle('<title> Vaga &ndash; iFood </title>')).toBe('Vaga – iFood')
    expect(pageTitle('<p>no title</p>')).toBeNull()
  })
})

describe('jobPostingFromJsonLd', () => {
  test('finds a JobPosting inside @graph and turns its HTML description into text', () => {
    const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'JobPosting', title: 'GenAI Engineer', hiringOrganization: { name: 'iFood' }, description: '<p>Build &lt;b&gt;LLM&lt;/b&gt; apps.</p>' }] }
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`
    expect(jobPostingFromJsonLd(html)).toEqual({ title: 'GenAI Engineer', text: 'GenAI Engineer\niFood\nBuild LLM apps.' })
  })

  test('ignores broken JSON and pages without a posting', () => {
    expect(jobPostingFromJsonLd('<script type="application/ld+json">{oops</script>')).toBeNull()
    expect(jobPostingFromJsonLd('<script type="application/ld+json">{"@type":"Organization"}</script>')).toBeNull()
  })
})

describe('extractPosting', () => {
  test('prefers a long JSON-LD description over the page body', () => {
    const description = long('Python em produção e RAG. ')
    const html = `<title>Page</title><script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Dev', description })}</script><body><p>Menu Login</p></body>`
    const out = extractPosting(html, 'text/html; charset=utf-8')
    expect(out.title).toBe('Dev')
    expect(out.text).toContain('Python em produção')
    expect(out.text).not.toContain('Menu Login')
  })

  test('caps very long text and says so', () => {
    const out = extractPosting('x'.repeat(MAX_POSTING_CHARS + 10), 'text/plain')
    expect(out.text).toHaveLength(MAX_POSTING_CHARS)
    expect(out.truncated).toBe(true)
  })
})

describe('looksBlocked', () => {
  test('LinkedIn login walls and near-empty pages count as blocked', () => {
    expect(looksBlocked(long('Job text. '), 'https://www.linkedin.com/authwall?trk=x')).toBe(true)
    expect(looksBlocked('Loading…', 'https://jobs.example.com/1')).toBe(true)
    expect(looksBlocked(`Sign in to view this job. ${long('a ')}`, 'https://jobs.example.com/1')).toBe(true)
  })

  test('a real posting does not', () => {
    expect(looksBlocked(long('Python em produção, RAG e avaliação de LLMs. '), 'https://jobs.example.com/1')).toBe(false)
  })
})

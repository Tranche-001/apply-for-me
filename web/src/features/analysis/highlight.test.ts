import { describe, expect, it } from 'vitest'
import { findQuoteLine, hasMark, markSegments, postingLines, quoteContext, sectionTitle } from './highlight'

describe('sectionTitle', () => {
  const lines = [
    'Senior GenAI Engineer',
    'About us',
    'ExampleCo builds AI assistants for finance teams.',
    'What you will do:',
    'Design, build and run RAG pipelines in production.',
    'Own our vector search layer (we use pgvector on PostgreSQL).',
    'Requirements',
    '3+ years building backend or data systems in Python.',
  ]

  it('finds the nearest heading above the line, without its colon', () => {
    expect(sectionTitle(lines, 5)).toBe('What you will do')
    expect(sectionTitle(lines, 7)).toBe('Requirements')
  })

  it('skips sentences on the way up', () => {
    expect(sectionTitle(lines, 4)).toBe('What you will do')
  })

  it('returns null when nothing above looks like a heading', () => {
    expect(sectionTitle(['A long first sentence of the posting.', 'Another sentence here.'], 1)).toBeNull()
    expect(sectionTitle(lines, 0)).toBeNull()
  })
})

describe('markSegments', () => {
  it('marks a phrase and keeps the text around it', () => {
    expect(markSegments('Built a RAG pipeline with pgvector', ['RAG pipeline'])).toEqual([
      { text: 'Built a ', mark: false },
      { text: 'RAG pipeline', mark: true },
      { text: ' with pgvector', mark: false },
    ])
  })

  it('returns the whole text unmarked when there are no phrases', () => {
    expect(markSegments('Hello', [])).toEqual([{ text: 'Hello', mark: false }])
  })

  it('returns nothing for empty text', () => {
    expect(markSegments('', ['x'])).toEqual([])
  })

  it('ignores phrases that are not found or empty', () => {
    const segs = markSegments('Hello world', ['Kafka', ''])
    expect(segs).toEqual([{ text: 'Hello world', mark: false }])
    expect(hasMark(segs)).toBe(false)
  })

  it('is case sensitive', () => {
    expect(hasMark(markSegments('Python scripts', ['python']))).toBe(false)
  })

  it('marks earliest first and skips overlapping phrases', () => {
    const segs = markSegments('abcdef', ['cde', 'abc', 'bcd'])
    expect(segs).toEqual([
      { text: 'abc', mark: true },
      { text: 'def', mark: false },
    ])
  })

  it('marks adjacent phrases separately', () => {
    expect(markSegments('abcd', ['ab', 'cd'])).toEqual([
      { text: 'ab', mark: true },
      { text: 'cd', mark: true },
    ])
  })

  it('does not mutate the phrases', () => {
    const phrases = ['b', 'a']
    markSegments('ab', phrases)
    expect(phrases).toEqual(['b', 'a'])
  })

  it('handles unicode and special characters', () => {
    expect(markSegments('Café “quoted” 🚀 ship', ['🚀'])[1]).toEqual({ text: '🚀', mark: true })
  })
})

describe('postingLines', () => {
  it('splits into trimmed lines and drops empties', () => {
    expect(postingLines('  About us \n\n\n We build  \n')).toEqual(['About us', 'We build'])
  })

  it('strips leading bullet glyphs', () => {
    expect(postingLines('• Python\n- TypeScript\n* Kafka\n–  Docker')).toEqual(['Python', 'TypeScript', 'Kafka', 'Docker'])
  })

  it('handles Windows line endings and empty input', () => {
    expect(postingLines('a\r\nb')).toEqual(['a', 'b'])
    expect(postingLines('')).toEqual([])
  })

  it('drops lines that are only a glyph', () => {
    expect(postingLines('•\n-\nreal')).toEqual(['real'])
  })
})

describe('findQuoteLine / quoteContext', () => {
  const lines = ['Requirements', 'Experience with Python and TypeScript', 'Mentor junior engineers', 'Nice to have']

  it('finds the line containing the quote', () => {
    expect(findQuoteLine(lines, 'Mentor junior engineers')).toBe(2)
  })

  it('finds a quote that is part of a line', () => {
    expect(findQuoteLine(lines, 'Python and TypeScript')).toBe(1)
  })

  it('normalizes whitespace and curly quotes', () => {
    expect(findQuoteLine(['She said “hello”  there'], 'She said "hello" there')).toBe(0)
    expect(findQuoteLine(['It’s  fine'], "It's fine")).toBe(0)
  })

  it('returns -1 when not found or quote is empty', () => {
    expect(findQuoteLine(lines, 'Kafka')).toBe(-1)
    expect(findQuoteLine(lines, '   ')).toBe(-1)
  })

  it('gives context before and after', () => {
    expect(quoteContext(lines, 'Mentor junior engineers')).toEqual({
      before: 'Experience with Python and TypeScript',
      line: 'Mentor junior engineers',
      after: 'Nice to have',
    })
  })

  it('gives null context at the edges', () => {
    expect(quoteContext(lines, 'Requirements')).toEqual({ before: null, line: 'Requirements', after: 'Experience with Python and TypeScript' })
    expect(quoteContext(lines, 'Nice to have')?.after).toBeNull()
  })

  it('returns null when the quote is not in the posting', () => {
    expect(quoteContext(lines, 'Kafka')).toBeNull()
  })
})

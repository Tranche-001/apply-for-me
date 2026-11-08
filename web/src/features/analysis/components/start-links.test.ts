import { describe, expect, test } from 'vitest'
import { MAX_LINKS, splitNotice, typedLinks, unreadNotice } from './start-links'

describe('splitNotice', () => {
  test('says how many postings there are and that only the picked one is compared', () => {
    expect(splitNotice(2)).toBe('This link has 2 job postings. Pick the one to analyze; the AI compares only that one with your blocks.')
    expect(splitNotice(4)).toContain('This link has 4 job postings.')
  })
})

describe('typedLinks', () => {
  test('keeps the links typed, trimmed, in order; empty rows are ignored', () => {
    expect(typedLinks([' https://a.example/x ', '', '  ', 'https://b.example/y'])).toEqual(['https://a.example/x', 'https://b.example/y'])
  })
  test('nothing typed gives an empty list', () => {
    expect(typedLinks(['', ' '])).toEqual([])
    expect(typedLinks([])).toEqual([])
  })
  test('the limit is 5', () => expect(MAX_LINKS).toBe(5))
})

describe('unreadNotice', () => {
  test('nothing unread: no notice', () => expect(unreadNotice([], 2)).toBeNull())
  test('names the host and the reason, and which links the analysis uses', () => {
    expect(unreadNotice([{ url: 'https://www.linkedin.com/jobs/view/1', error: 'This site blocks apps.' }], 2)).toBe(
      'Couldn’t read linkedin.com: This site blocks apps. The analysis uses the other link.',
    )
  })
  test('one sentence per link; plural when several are used', () => {
    const text = unreadNotice(
      [
        { url: 'https://a.example/x', error: 'Not found.' },
        { url: 'https://b.example/y', error: 'Timed out.' },
      ],
      4,
    )
    expect(text).toBe('Couldn’t read a.example: Not found. Couldn’t read b.example: Timed out. The analysis uses the other links.')
  })
  test('a url that cannot be parsed falls back to the text itself', () => {
    expect(unreadNotice([{ url: 'not a url', error: 'Bad.' }], 2)).toContain('Couldn’t read not a url: Bad.')
  })
})

import { describe, expect, test } from 'vitest'
import { MAX_LINKS, overlapHeading, overlapReason, sameJobNote, splitHeading, splitNotice, typedLinks, unreadNotice } from './start-links'

describe('splitNotice', () => {
  test('says how many postings there are and that only the picked one is compared', () => {
    expect(splitNotice(2)).toBe('This link has 2 job postings. Pick the one to analyze; the AI compares only that one with your blocks.')
    expect(splitNotice(4)).toContain('This link has 4 job postings.')
  })

  test('pasted text and several links are named as such; tracks are tracks', () => {
    expect(splitNotice(2, 'text')).toContain('This text has 2 job postings.')
    expect(splitNotice(3, 'links')).toContain('These links have 3 job postings.')
    expect(splitNotice(2, 'link', true)).toBe('This posting has 2 tracks. Pick the one to analyze; the AI compares only that one with your blocks.')
  })
})

describe('overlap card', () => {
  const A = 'https://carreiras.ifood.com.br/gen-ai/'
  const B = 'https://carreiras.ifood.com.br/job/8901054002/'

  test('the heading counts the links', () => {
    expect(overlapHeading(2)).toBe('These 2 links look like the same job.')
    expect(overlapHeading(3)).toBe('These 3 links look like the same job.')
  })

  test('the reason names each link by host and path and says how much repeats', () => {
    expect(overlapReason([A, B], 0.83)).toBe('carreiras.ifood.com.br/gen-ai/ and carreiras.ifood.com.br/job/8901054002/ share most of their text (83% of the lines are the same).')
    expect(overlapReason(['https://a.example/1', 'https://b.example/2', 'https://c.example/3'], 1)).toMatch(/^a\.example\/1, b\.example\/2 and c\.example\/3 share/)
  })

  test('the line under the choice follows it', () => {
    expect(sameJobNote(true, 2)).toBe('The app keeps one copy of the text and continues. Both links are saved on the job.')
    expect(sameJobNote(true, 3)).toBe('The app keeps one copy of the text and continues. All 3 links are saved on the job.')
    expect(sameJobNote(false, 2)).toBe('The app keeps both texts apart and shows “Which job?” so you pick one.')
    expect(sameJobNote(false, 3)).toBe('The app keeps the texts apart and shows “Which job?” so you pick one.')
  })
})

describe('splitHeading', () => {
  test('plain jobs: where they came from', () => {
    expect(splitHeading(2, 'link', false).title).toBe('This link has 2 jobs')
    expect(splitHeading(2, 'text', false).title).toBe('This text has 2 jobs')
    expect(splitHeading(3, 'links', false).title).toBe('These links have 3 jobs')
    expect(splitHeading(2, 'link', false).sub).toMatch(/Pick the one to analyze now/)
  })

  test('tracks of one posting, whatever the source', () => {
    expect(splitHeading(2, 'links', true)).toEqual({ title: 'This posting has 2 tracks.', sub: 'Pick the one to analyze. Each keeps the program’s shared part.' })
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

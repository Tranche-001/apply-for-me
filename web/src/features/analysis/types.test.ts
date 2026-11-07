import { describe, expect, test } from 'vitest'
import { STEP_NAMES, guessLinkKind } from './types'

describe('links', () => {
  test('guessLinkKind: application systems vs postings', () => {
    expect(guessLinkKind('https://ifood.gupy.io/jobs/123')).toBe('APPLICATION')
    expect(guessLinkKind('boards.greenhouse.io/acme/jobs/1')).toBe('APPLICATION')
    expect(guessLinkKind('https://www.linkedin.com/jobs/view/1')).toBe('POSTING')
    expect(guessLinkKind('not a url')).toBe('OTHER')
  })
})

describe('steps', () => {
  test('the five steps of the pipeline, in order', () => {
    expect(STEP_NAMES).toEqual(['Read posting', 'Compare with blocks', 'Your input', 'Drafts', 'Review & save'])
  })
})

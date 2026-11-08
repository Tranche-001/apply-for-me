import { describe, expect, test } from 'vitest'
import { addsSeniority, cleanOrder, cleanRoleTitles, type CvBlockRef } from './cv-order'

const BLOCKS: CvBlockRef[] = [
  { key: 'b-visio', section: 'EXPERIENCE', name: 'Visio AI', versionId: null },
  { key: 'b-rats', section: 'EXPERIENCE', name: 'Study Rats', versionId: 'v-rats-base' },
  { key: 'b-bi', section: 'PROJECT', name: 'BI Dashboard', versionId: 'v-bi-llm' },
  { key: 'new:kafka pipeline', section: 'PROJECT', name: 'Kafka Pipeline', versionId: null },
]

describe('cleanOrder', () => {
  test('keeps the AI order of the blocks of this CV', () => {
    expect(cleanOrder(['b-bi', 'b-visio', 'b-rats'], BLOCKS)).toEqual(['b-bi', 'b-visio', 'b-rats'])
  })

  test('a new block is named by its name; a reused version id or a block name also find the block', () => {
    expect(cleanOrder(['Kafka Pipeline', 'v-rats-base', 'visio ai'], BLOCKS)).toEqual(['new:kafka pipeline', 'b-rats', 'b-visio'])
  })

  test('unknown ids are dropped and a block counts once', () => {
    expect(cleanOrder(['ghost', 'b-visio', '', 'b-visio', 'Visio AI', 'b-bi'], BLOCKS)).toEqual(['b-visio', 'b-bi'])
  })
})

describe('cleanRoleTitles', () => {
  test('one title per experience block of the CV, trimmed', () => {
    const out = cleanRoleTitles(
      [
        { block: 'b-visio', title: '  AI   Builder ' },
        { block: 'Study Rats', title: 'AI Builder' },
        { block: 'b-visio', title: 'Second title' },
      ],
      BLOCKS,
      'AI Builder',
    )
    expect(out).toEqual([
      { block: 'b-visio', title: 'AI Builder' },
      { block: 'b-rats', title: 'AI Builder' },
    ])
  })

  test('projects, unknown blocks, empty or very long titles are dropped', () => {
    const out = cleanRoleTitles(
      [
        { block: 'b-bi', title: 'AI Builder' },
        { block: 'ghost', title: 'AI Builder' },
        { block: 'b-visio', title: '  ' },
        { block: 'b-rats', title: 'x'.repeat(121) },
      ],
      BLOCKS,
      'AI Builder',
    )
    expect(out).toEqual([])
  })

  test('a title more senior than the job is dropped', () => {
    expect(cleanRoleTitles([{ block: 'b-visio', title: 'Senior AI Engineer' }], BLOCKS, 'AI Engineer')).toEqual([])
    expect(cleanRoleTitles([{ block: 'b-visio', title: 'AI Tech Lead' }], BLOCKS, 'AI Builder')).toEqual([])
  })

  test('the seniority the job asks for is fine', () => {
    expect(cleanRoleTitles([{ block: 'b-visio', title: 'Senior Software Engineer' }], BLOCKS, 'Senior Software Engineer')).toEqual([{ block: 'b-visio', title: 'Senior Software Engineer' }])
  })
})

describe('addsSeniority', () => {
  test('finds seniority words the role lacks, whole words only, any case', () => {
    expect(addsSeniority('Sr. Backend Engineer', 'Backend Engineer')).toBe(true)
    expect(addsSeniority('Staff Engineer', 'Software Engineer')).toBe(true)
    expect(addsSeniority('Software Engineer', 'Software Engineer')).toBe(false)
    expect(addsSeniority('Leading Engineer', 'Engineer')).toBe(false)
    expect(addsSeniority('LEAD Engineer', 'Lead Engineer')).toBe(false)
  })
})

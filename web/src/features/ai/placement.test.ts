import { describe, expect, test } from 'vitest'
import { finalizePlacement } from './placement'
import { buildPlacementPrompt } from './prompts'
import { EXPERIENCE } from './test-fixtures'

const EXPERIENCES = [
  { id: 'e-visio', title: 'Visio AI' },
  { id: 'e-study', title: 'Study Rats' },
  { id: 'e-uni', title: 'University of São Paulo' },
  { id: 'e-extra', title: 'Freelance' },
]
const ITEMS = [{ askId: 'q1' }, { askId: 'q2' }]
const row = (over: Partial<Parameters<typeof finalizePlacement>[0]['placements'][number]> = {}) => ({
  askId: 'q1',
  experienceId: 'e-visio',
  alsoFits: [],
  why: 'You wrote it at Visio AI.',
  newExperienceName: null,
  ...over,
})

describe('finalizePlacement', () => {
  test('keeps a valid pick and returns one row per item, in order', () => {
    const out = finalizePlacement({ placements: [row({ askId: 'q2', experienceId: 'e-study' }), row()] }, ITEMS, EXPERIENCES)
    expect(out.map((o) => o.askId)).toEqual(['q1', 'q2'])
    expect(out[0].experienceId).toBe('e-visio')
    expect(out[1].experienceId).toBe('e-study')
  })

  test('an item the AI skipped comes back unplaced', () => {
    const out = finalizePlacement({ placements: [row()] }, ITEMS, EXPERIENCES)
    expect(out[1]).toEqual({ askId: 'q2', experienceId: null, alsoFits: [], why: '', newExperienceName: null })
  })

  test('an unknown experience id becomes null; unknown ask ids are ignored', () => {
    const out = finalizePlacement({ placements: [row({ experienceId: 'nope' }), row({ askId: 'ghost' })] }, ITEMS, EXPERIENCES)
    expect(out).toHaveLength(2)
    expect(out[0].experienceId).toBeNull()
  })

  test('alsoFits drops unknown ids, the main pick and duplicates, and keeps two at most', () => {
    const out = finalizePlacement({ placements: [row({ alsoFits: ['e-visio', 'nope', 'e-study', 'e-study', 'e-uni', 'e-extra'] })] }, ITEMS, EXPERIENCES)
    expect(out[0].alsoFits).toEqual(['e-study', 'e-uni'])
  })

  test('why never shows a database id', () => {
    const id = 'c' + 'a1'.repeat(10)
    const exps = [{ id, title: 'Visio AI' }]
    const out = finalizePlacement({ placements: [row({ experienceId: id, why: `It belongs in ${id} because of Kafka.` })] }, ITEMS, exps)
    expect(out[0].why).toBe('It belongs in Visio AI because of Kafka.')
  })

  test('a new experience name is kept only when there is no experience', () => {
    const none = finalizePlacement({ placements: [row({ experienceId: null, newExperienceName: '  Study  Rats 2 ' })] }, ITEMS, EXPERIENCES)
    expect(none[0]).toMatchObject({ experienceId: null, newExperienceName: 'Study Rats 2' })
    const both = finalizePlacement({ placements: [row({ newExperienceName: 'Something' })] }, ITEMS, EXPERIENCES)
    expect(both[0].newExperienceName).toBeNull()
  })

  test('a "new" name that already exists points at the existing experience', () => {
    const out = finalizePlacement({ placements: [row({ experienceId: null, newExperienceName: 'visio ai' })] }, ITEMS, EXPERIENCES)
    expect(out[0]).toMatchObject({ experienceId: 'e-visio', newExperienceName: null })
  })

  test('no pick and no name stays null for both (the screen asks)', () => {
    const out = finalizePlacement({ placements: [row({ experienceId: null, newExperienceName: '  ' })] }, ITEMS, EXPERIENCES)
    expect(out[0]).toMatchObject({ experienceId: null, newExperienceName: null })
  })

  test('the first row for an ask wins', () => {
    const out = finalizePlacement({ placements: [row({ experienceId: 'e-study' }), row({ experienceId: 'e-uni' })] }, ITEMS, EXPERIENCES)
    expect(out[0].experienceId).toBe('e-study')
  })
})

describe('buildPlacementPrompt', () => {
  test('lists the answers and the experiences, and forbids inventing places', () => {
    const p = buildPlacementPrompt({ items: [{ askId: 'q1', question: 'Did you use Kafka?', answer: 'Yes, at Visio AI.' }], experiences: [EXPERIENCE] })
    expect(p.system).toMatch(/never invent/i)
    expect(p.context).toContain('id="e-visio"')
    expect(p.request).toContain('q1')
    expect(p.request).toContain('Yes, at Visio AI.')
  })
})

import { describe, expect, it } from 'vitest'
import { newNameFromQuery, pickerGroups } from './picker'

const all = [
  { id: 'e1', title: 'Visio AI' },
  { id: 'e2', title: 'Étude Python' },
  { id: 'e3', title: 'BI Dashboard' },
  { id: 'e4', title: 'Zeta' },
  { id: 'e5', title: 'Study Rats' },
]

describe('pickerGroups', () => {
  it('puts the AI pick first, then also fits, then the rest A-Z', () => {
    const g = pickerGroups({ all, aiPick: 'e1', alsoFits: ['e3'], query: '' })
    expect(g.suggested).toEqual([
      { id: 'e1', title: 'Visio AI', tag: 'ai' },
      { id: 'e3', title: 'BI Dashboard', tag: 'also' },
    ])
    expect(g.rest.map((e) => e.title)).toEqual(['Étude Python', 'Study Rats', 'Zeta'])
    expect(g.empty).toBe(false)
  })

  it('sorts accents with localeCompare', () => {
    const g = pickerGroups({ all, aiPick: null, alsoFits: [], query: '' })
    expect(g.rest.map((e) => e.title)).toEqual(['BI Dashboard', 'Étude Python', 'Study Rats', 'Visio AI', 'Zeta'])
  })

  it('works without an AI pick', () => {
    const g = pickerGroups({ all, aiPick: null, alsoFits: ['e5'], query: '' })
    expect(g.suggested).toEqual([{ id: 'e5', title: 'Study Rats', tag: 'also' }])
  })

  it('ignores unknown ids and duplicates', () => {
    const g = pickerGroups({ all, aiPick: 'nope', alsoFits: ['e1', 'e1'], query: '' })
    expect(g.suggested).toEqual([{ id: 'e1', title: 'Visio AI', tag: 'also' }])
  })

  it('hides suggested and filters case-insensitively when there is a query', () => {
    const g = pickerGroups({ all, aiPick: 'e1', alsoFits: [], query: '  STUDY ' })
    expect(g.suggested).toEqual([])
    expect(g.rest).toEqual([{ id: 'e5', title: 'Study Rats' }])
    expect(g.empty).toBe(false)
  })

  it('searches inside suggested experiences too when there is a query', () => {
    const g = pickerGroups({ all, aiPick: 'e1', alsoFits: [], query: 'visio' })
    expect(g.rest).toEqual([{ id: 'e1', title: 'Visio AI' }])
  })

  it('is empty when nothing matches', () => {
    const g = pickerGroups({ all, aiPick: 'e1', alsoFits: [], query: 'kubernetes' })
    expect(g).toEqual({ suggested: [], rest: [], empty: true })
  })

  it('is empty for an empty library without a query', () => {
    expect(pickerGroups({ all: [], aiPick: null, alsoFits: [], query: '' }).empty).toBe(true)
  })

  it('does not mutate the input', () => {
    const copy = [...all]
    pickerGroups({ all, aiPick: null, alsoFits: [], query: '' })
    expect(all).toEqual(copy)
  })
})

describe('newNameFromQuery', () => {
  it('uses the typed text when nothing matches', () => {
    expect(newNameFromQuery('  Kafka pipeline ', false)).toBe('Kafka pipeline')
  })

  it('is empty when something matches or nothing was typed', () => {
    expect(newNameFromQuery('Kafka', true)).toBe('')
    expect(newNameFromQuery('   ', false)).toBe('')
  })
})

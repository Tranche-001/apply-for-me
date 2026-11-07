import { describe, expect, test } from 'vitest'
import { groupRules, type RuleItem } from '../preferences/types'
import { answerEntry, appendEntry, appendPrompt, matchesExperience, type ExperienceItem } from './types'

const item: ExperienceItem = { id: 'e1', title: 'Visio AI', where: 'São Carlos', when: '2026', notes: 'Built a reconciliation platform', blocks: [] }

describe('experiences helpers', () => {
  test('a prompt starts its own paragraph', () => {
    expect(appendPrompt('', 'Feedback I got')).toBe('Feedback I got: ')
    expect(appendPrompt('Line one.\n\n  ', 'A situation')).toBe('Line one.\n\nA situation: ')
  })

  test('search looks at title, place, dates and notes', () => {
    expect(matchesExperience(item, 'RECONCILIATION')).toBe(true)
    expect(matchesExperience(item, 'carlos')).toBe(true)
    expect(matchesExperience(item, 'gupy')).toBe(false)
    expect(matchesExperience(item, '  ')).toBe(true)
  })
})

describe('preferences groupRules', () => {
  test('known groups first, even when empty, then unknown ones', () => {
    const rule = (id: string, group: string): RuleItem => ({ id, group, text: id, source: '', on: true, position: 0 })
    const groups = groupRules([rule('a', 'qa'), rule('b', 'misc'), rule('c', 'cv')])
    expect(groups.map((g) => [g.name, g.rules.map((r) => r.id)])).toEqual([
      ['Blocks and CVs', ['c']],
      ['Interview answers', ['a']],
      ['misc', ['b']],
    ])
  })
})

describe('answers added to an experience', () => {
  const entry = answerEntry({ jobLabel: ' iFood · GenAI ', question: ' Did you use RAG? ', answer: ' Yes. ' })

  test('an answer reads as the job, the question and your words', () => {
    expect(entry).toBe('For iFood · GenAI\nThe AI asked: Did you use RAG?\nMy answer: Yes.')
  })

  test('appendEntry only adds at the end: the old text is kept exactly, spaces and all', () => {
    for (const old of ['Line one.', 'Line one.  ', 'Line one.\n', 'Line one.\n\n', '  ']) {
      const next = appendEntry(old, entry)
      expect(next.startsWith(old)).toBe(true)
      expect(next.endsWith(entry)).toBe(true)
    }
    expect(appendEntry('Line one.', entry)).toBe(`Line one.\n\n${entry}`)
    expect(appendEntry('Line one.\n', entry)).toBe(`Line one.\n\n${entry}`)
    expect(appendEntry('Line one.\n\n', entry)).toBe(`Line one.\n\n${entry}`)
    expect(appendEntry('', entry)).toBe(entry)
  })

  test('the same answer is never added twice', () => {
    const once = appendEntry('Line one.', entry)
    expect(appendEntry(once, entry)).toBe(once)
  })
})

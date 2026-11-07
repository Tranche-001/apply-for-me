import { describe, expect, test } from 'vitest'
import { groupRules, type RuleItem } from '../preferences/types'
import { answerEntry, appendEntry, appendPrompt, matchesExperience, removeEntry, replaceEntry, type ExperienceItem } from './types'

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

describe('replaceEntry', () => {
  const OLD = 'For A\nThe AI asked: Q\nMy answer: one\n\nstill the same answer, after a blank line'
  const NEW = 'For A\nThe AI asked: Q\nMy answer: two'

  test('replaces the entry at the start, middle and end; everything else is byte for byte', () => {
    const before = 'Intro.  \n\n'
    const after = '\n\nOutro.\n\n\n'
    expect(replaceEntry(`${OLD}${after}`, OLD, NEW)).toEqual({ notes: `${NEW}${after}`, replaced: true })
    expect(replaceEntry(`${before}${OLD}${after}`, OLD, NEW)).toEqual({ notes: `${before}${NEW}${after}`, replaced: true })
    expect(replaceEntry(`${before}${OLD}`, OLD, NEW)).toEqual({ notes: `${before}${NEW}`, replaced: true })
  })

  test('keeps CRLF and trailing blank lines untouched', () => {
    const notes = `Line\r\n\r\n${OLD}\r\n\r\nEnd  \r\n\n\n`
    expect(replaceEntry(notes, OLD, NEW).notes).toBe(`Line\r\n\r\n${NEW}\r\n\r\nEnd  \r\n\n\n`)
  })

  test('only the first occurrence is replaced', () => {
    expect(replaceEntry(`${OLD}\n\n${OLD}`, OLD, NEW).notes).toBe(`${NEW}\n\n${OLD}`)
  })

  test('identical old and new leaves the notes unchanged', () => {
    const notes = `x\n\n${OLD}\n\ny`
    expect(replaceEntry(notes, OLD, OLD)).toEqual({ notes, replaced: true })
  })

  test('entry not found (edited by hand): the new one is appended at the end', () => {
    expect(replaceEntry('Mine.', 'gone', NEW)).toEqual({ notes: `Mine.\n\n${NEW}`, replaced: false })
    expect(replaceEntry('Mine.\n', 'gone', NEW).notes).toBe(`Mine.\n\n${NEW}`)
    expect(replaceEntry('', 'gone', NEW)).toEqual({ notes: NEW, replaced: false })
  })

  test('an empty old entry is treated as not found', () => {
    expect(replaceEntry('Mine.', '', NEW)).toEqual({ notes: `Mine.\n\n${NEW}`, replaced: false })
  })
})

describe('removeEntry', () => {
  const E = 'For A\nThe AI asked: Q\nMy answer: one\n\nsecond paragraph'

  test('in the middle: removes the entry and the blank line before it', () => {
    expect(removeEntry(`Top.\n\n${E}\n\nBottom.`, E)).toEqual({ notes: 'Top.\n\nBottom.', removed: true })
  })

  test('at the end: removes the entry and the blank line before it', () => {
    expect(removeEntry(`Top.\n\n${E}`, E)).toEqual({ notes: 'Top.', removed: true })
  })

  test('at the start: removes the entry and the blank line after it', () => {
    expect(removeEntry(`${E}\n\nBottom.\n`, E)).toEqual({ notes: 'Bottom.\n', removed: true })
  })

  test('the only content: leaves empty notes', () => {
    expect(removeEntry(E, E)).toEqual({ notes: '', removed: true })
  })

  test('only ONE separator goes; other blank lines and spaces stay', () => {
    expect(removeEntry(`Top.  \n\n\n${E}\n\n\nBottom.`, E).notes).toBe('Top.  \n\n\n\nBottom.')
    // single newlines are not a blank-line separator: only the entry goes
    expect(removeEntry(`Top.\n${E}\nBottom.`, E).notes).toBe('Top.\n\nBottom.')
  })

  test('CRLF blank line counts as the separator', () => {
    expect(removeEntry(`Top.\r\n\r\n${E}\r\n\r\nBottom.`, E).notes).toBe('Top.\r\n\r\nBottom.')
  })

  test('not found or empty entry: unchanged', () => {
    expect(removeEntry('Mine.', E)).toEqual({ notes: 'Mine.', removed: false })
    expect(removeEntry('Mine.', '')).toEqual({ notes: 'Mine.', removed: false })
  })
})

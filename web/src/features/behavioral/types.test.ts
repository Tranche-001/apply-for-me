import { describe, expect, test } from 'vitest'
import {
  behavioralQuery,
  copyFounder,
  copyMessage,
  dbLang,
  fromDbLang,
  interviewItems,
  pickLang,
  isCustomKey,
  looksForLines,
  pickJob,
  questionStatus,
  tailoredCount,
  tailoredKey,
  type QuestionItem,
} from './types'

const q = (id: string, answer: string): QuestionItem => ({
  id,
  key: id,
  n: '01',
  short: `Short ${id}`,
  full: `Full ${id}`,
  looksFor: [],
  answers: { en: answer, pt: '' },
  theory: '',
  references: [],
  useFounder: true,
  founderNotes: '',
  founderRefs: [],
  custom: false,
})

describe('questions you add', () => {
  test('only keys made on this screen count as yours', () => {
    expect(isCustomKey('custom-k3x9')).toBe(true)
    expect(isCustomKey('initiative')).toBe(false)
    expect(isCustomKey('my-custom-')).toBe(false)
  })

  test('what interviewers look for: one per line, bullets, blanks and repeats dropped', () => {
    expect(looksForLines('- Iniciativa\n\n• Impacto com números \n  iniciativa\n* Escuta')).toEqual(['Iniciativa', 'Impacto com números', 'Escuta'])
    expect(looksForLines('   \n')).toEqual([])
  })
})

describe('copyFounder', () => {
  test('adds the notes after yours and only the references you lack', () => {
    const r = copyFounder({ theory: 'Minhas notas.', references: ['STAR'] }, { notes: 'Use STAR.', refs: ['star', 'Livro'] })
    expect(r).toEqual({ theory: 'Minhas notas.\n\nUse STAR.', references: ['STAR', 'Livro'], notesAdded: true, refsAdded: 1 })
    expect(copyMessage(r)).toBe('Added the Founder’s notes and 1 reference to yours. Edit them as you like.')
  })

  test('copying twice changes nothing and says so', () => {
    const once = copyFounder({ theory: '', references: [] }, { notes: 'Use STAR.', refs: ['A'] })
    const twice = copyFounder(once, { notes: 'Use STAR.', refs: ['A'] })
    expect(twice).toMatchObject({ theory: 'Use STAR.', references: ['A'], notesAdded: false, refsAdded: 0 })
    expect(copyMessage(twice)).toBe('The Founder’s notes and references are already in yours.')
  })
})

describe('statuses and interview mode', () => {
  const tailored = {
    [tailoredKey('q1', 'j1', 'en')]: 'Adapted',
    [tailoredKey('q1', 'j2', 'en')]: '  ',
    [tailoredKey('q2', 'j1', 'en')]: 'Only adapted',
    [tailoredKey('q1', 'j2', 'pt')]: 'Adaptada',
  }

  test('counts job versions with text, in the chosen language only', () => {
    expect(tailoredCount(tailored, 'q1', 'en')).toBe(1)
    expect(tailoredCount(tailored, 'q1', 'pt')).toBe(1)
    expect(tailoredCount(tailored, 'q2', 'pt')).toBe(0)
    expect(questionStatus('Resposta', 2)).toBe('Answered · 2 job versions')
    expect(questionStatus('', 0)).toBe('Not started')
  })

  test('uses the adapted answer for the job, else the generalist one, and skips unanswered questions', () => {
    const items = interviewItems([q('q1', 'General'), q('q2', ''), q('q3', '  ')], tailored, 'j1', 'en')
    expect(items.map((i) => [i.id, i.answer, i.adapted])).toEqual([
      ['q1', 'Adapted', true],
      ['q2', 'Only adapted', true],
    ])
    expect(interviewItems([q('q1', 'General')], tailored, null, 'en')[0]).toMatchObject({ answer: 'General', adapted: false })
  })

  test('switching language never shows the other language’s answer', () => {
    const both = { ...q('q1', 'In English'), answers: { en: 'In English', pt: '' } }
    expect(interviewItems([both], tailored, 'j1', 'pt')).toEqual([])
    expect(interviewItems([both], tailored, 'j2', 'pt')[0]).toMatchObject({ answer: 'Adaptada', adapted: true })
  })

  test('the language comes from the link, English when missing or unknown, and goes back into it', () => {
    expect(pickLang('pt')).toBe('pt')
    expect(pickLang('fr')).toBe('en')
    expect(pickLang(null)).toBe('en')
    expect(behavioralQuery('j1', 'pt')).toBe('?job=j1&lang=pt')
    expect(behavioralQuery('j1', 'en')).toBe('?job=j1')
    expect(behavioralQuery(null, 'en')).toBe('')
    expect([dbLang('pt'), dbLang('en'), fromDbLang('PT'), fromDbLang('EN')]).toEqual(['PT', 'EN', 'pt', 'en'])
  })

  test('pickJob keeps the job from the link when it exists', () => {
    const jobs = [
      { id: 'j1', label: 'A', company: 'A' },
      { id: 'j2', label: 'B', company: 'B' },
    ]
    expect(pickJob(jobs, 'j2')).toBe('j2')
    expect(pickJob(jobs, 'gone')).toBe('j1')
    expect(pickJob([], 'j1')).toBeNull()
  })
})

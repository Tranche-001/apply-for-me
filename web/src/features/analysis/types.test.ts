import { describe, expect, test } from 'vitest'
import type { MadeDraft } from './types'
import { answersToFile, currentStep, destinationOf, guessLinkKind, madeSummary, parseUrls, toSave } from './types'

const draft = (over: Partial<MadeDraft>): MadeDraft => ({
  key: 'd1',
  blockId: 'b1',
  newBlock: null,
  blockName: 'Visio AI',
  name: 'Job',
  title: 'T',
  bullets: [],
  waitingOn: null,
  note: '',
  keep: true,
  editing: false,
  ...over,
})

describe('links', () => {
  test('parseUrls splits on spaces, commas and lines, without duplicates', () => {
    expect(parseUrls(' https://a.com/1, https://b.com/2\nhttps://a.com/1 ')).toEqual(['https://a.com/1', 'https://b.com/2'])
    expect(parseUrls('   ')).toEqual([])
  })

  test('guessLinkKind: application systems vs postings', () => {
    expect(guessLinkKind('https://ifood.gupy.io/jobs/123')).toBe('APPLICATION')
    expect(guessLinkKind('boards.greenhouse.io/acme/jobs/1')).toBe('APPLICATION')
    expect(guessLinkKind('https://www.linkedin.com/jobs/view/1')).toBe('POSTING')
    expect(guessLinkKind('not a url')).toBe('OTHER')
  })
})

describe('drafts', () => {
  const made = [draft({ key: 'a' }), draft({ key: 'b', keep: false }), draft({ key: 'c', blockId: null, waitingOn: 'q1' })]

  test('summary counts versions and blocks, and says when a block waits', () => {
    expect(madeSummary(made)).toBe('2 new versions · 1 new block (waiting)')
    expect(madeSummary([])).toBe('Nothing yet')
  })

  test('only kept drafts that are not waiting are saved', () => {
    expect(toSave(made).map((m) => m.key)).toEqual(['a'])
  })
})

describe('currentStep', () => {
  const base = { phase: 'idle' as const, analysis: null, openAsks: 0, saved: false, redrafting: false }
  const analysis = { requirements: [], asks: [], drafts: [], reused: [], report: [] }

  test('follows the flow', () => {
    expect(currentStep({ ...base, phase: 'reading' })).toBe(0)
    expect(currentStep({ ...base, phase: 'analyzing' })).toBe(1)
    expect(currentStep({ ...base, analysis, openAsks: 2 })).toBe(2)
    expect(currentStep({ ...base, phase: 'analyzing', redrafting: true })).toBe(3)
    expect(currentStep({ ...base, analysis })).toBe(4)
    expect(currentStep({ ...base, analysis, saved: true })).toBe(5)
  })
})

describe('gap answers going to Experiences', () => {
  const asks = [
    { id: 'q1', text: 'RAG?', experienceId: 'visio' },
    { id: 'q2', text: 'Evals?', experienceId: null },
    { id: 'q3', text: 'Gemini?' },
    { id: 'q4', text: 'Kafka?', experienceId: 'iaas' },
  ]

  test('destination: your pick, else the AI’s experience, else the answers place', () => {
    expect(destinationOf(asks[0], {})).toBe('visio')
    expect(destinationOf(asks[0], { q1: 'iaas' })).toBe('iaas')
    expect(destinationOf(asks[1], {})).toBe('')
    expect(destinationOf(asks[2], {}, 'answers')).toBe('answers')
    expect(destinationOf(asks[1], { q2: '' }, 'answers')).toBe('')
  })

  test('only written answers, not “Don’t have it”, not ones already added word for word', () => {
    const answers = { q1: ' Yes, at Visio. ', q2: '   ', q3: 'Used Gemini 3.', q4: 'Kafka streams.' }
    const filed = { q4: { answer: 'Kafka streams.', experienceId: 'iaas', title: 'IAAS!' } }
    const out = answersToFile(asks, answers, { q3: true }, filed)
    expect(out).toEqual([{ ask: asks[0], answer: 'Yes, at Visio.' }])
    // An edited answer is added again (as a new entry; the old one stays).
    expect(answersToFile(asks, { q4: 'Kafka streams, 2M events/day.' }, {}, filed).map((x) => x.ask.id)).toEqual(['q4'])
  })
})

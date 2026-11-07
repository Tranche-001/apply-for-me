import { describe, expect, test } from 'vitest'
import { answerState, appendChip, canSend, clip, sendHint, sendLabel, sentRows, sentStatus, type SendInput } from './resend'
import type { SentAnswer } from './types'

const ANSWER = 'Yes: at Visio AI I built a RAG prototype over invoice data with pgvector in Supabase.'

const sentAnswer = (over: Partial<SentAnswer> = {}): SentAnswer => ({
  question: 'Have you built RAG pipelines?',
  answer: ANSWER,
  entry: ANSWER,
  experienceId: 'exp-visio',
  experienceTitle: 'Visio AI',
  isNewExperience: false,
  resent: false,
  ...over,
})

const dontSent = (over: Partial<SentAnswer> = {}): SentAnswer => sentAnswer({ answer: null, entry: null, experienceId: null, experienceTitle: '', ...over })

const input = (over: Partial<SendInput> = {}): SendInput => ({ n: 1, text: ANSWER, dont: false, sent: sentAnswer(), ...over })

describe('answerState', () => {
  test('"I don’t have this" wins over a written answer', () => {
    expect(answerState('Yes, I did', true)).toBe('dont')
  })
  test('a written answer is done; blank or missing is empty', () => {
    expect(answerState('Yes', false)).toBe('done')
    expect(answerState('   \n', undefined)).toBe('empty')
    expect(answerState(undefined, undefined)).toBe('empty')
  })
})

describe('appendChip', () => {
  test('starts an empty answer with the prompt', () => {
    expect(appendChip('', 'Something I did')).toBe('Something I did: ')
  })
  test('adds the prompt on a new paragraph, dropping trailing blanks', () => {
    expect(appendChip('Built a RAG prototype.  \n', 'A number or result')).toBe('Built a RAG prototype.\n\nA number or result: ')
  })
})

describe('clip', () => {
  test('keeps short text as it is', () => {
    expect(clip('A short answer')).toBe('A short answer')
  })
  test('cuts long text to 52 characters ending in an ellipsis', () => {
    const out = clip(ANSWER)
    expect(out.length).toBeLessThanOrEqual(52)
    expect(out.endsWith('…')).toBe(true)
    expect(out).toBe(`${ANSWER.slice(0, 51).trimEnd()}…`)
  })
})

describe('canSend', () => {
  test('is off while the answer is the one already sent', () => {
    expect(canSend(input())).toBe(false)
    expect(canSend(input({ text: `  ${ANSWER}  ` }))).toBe(false)
  })
  test('is on when the answer changed', () => {
    expect(canSend(input({ text: `${ANSWER} It answers in plain language.` }))).toBe(true)
  })
  test('is off for a blank answer', () => {
    expect(canSend(input({ text: '  ' }))).toBe(false)
    expect(canSend(input({ text: '', sent: undefined }))).toBe(false)
  })
  test('is on for a first answer', () => {
    expect(canSend(input({ sent: undefined }))).toBe(true)
  })
  test('is on for an answer after "I don’t have this" was sent, even the same words', () => {
    expect(canSend(input({ sent: dontSent() }))).toBe(true)
  })
  test('"I don’t have this" can be sent once', () => {
    expect(canSend(input({ dont: true }))).toBe(true)
    expect(canSend(input({ dont: true, sent: undefined }))).toBe(true)
    expect(canSend(input({ dont: true, sent: dontSent() }))).toBe(false)
  })
})

describe('sendHint', () => {
  test('nothing to say when "I don’t have this" was already sent', () => {
    expect(sendHint(input({ dont: true, sent: dontSent() }))).toBe('')
  })
  test('after a resend, says the drafts are being redone', () => {
    expect(sendHint(input({ sent: sentAnswer({ resent: true }) }))).toBe('Sent. The AI is redoing the drafts that use it.')
  })
  test('an unchanged answer asks for a change', () => {
    expect(sendHint(input())).toBe('Change the answer to resend it.')
  })
  test('a blank answer never sent asks for one', () => {
    expect(sendHint(input({ text: '', sent: undefined }))).toBe('Write your answer to send it.')
    expect(sendHint(input({ text: '', sent: dontSent() }))).toBe('Write your answer to send it.')
  })
  test('"I don’t have this" removes what the question added, and where', () => {
    expect(sendHint(input({ n: 2, dont: true }))).toBe('Removes what Q2 added to Visio AI.')
    expect(sendHint(input({ n: 3, dont: true, sent: undefined }))).toBe('Removes what Q3 added.')
  })
  test('a changed answer replaces only what the question added', () => {
    expect(sendHint(input({ text: 'Changed' }))).toBe('Replaces only what Q1 added to Visio AI. The rest of its notes stay as they are.')
  })
  test('a first answer (or one not placed yet) goes where the AI decides', () => {
    expect(sendHint(input({ sent: undefined }))).toBe('The AI adds it to the experience it is about and drafts a block.')
    expect(sendHint(input({ sent: dontSent() }))).toBe('The AI adds it to the experience it is about and drafts a block.')
    expect(sendHint(input({ text: 'Changed', sent: sentAnswer({ experienceTitle: ' ' }) }))).toBe(
      'The AI adds it to the experience it is about and drafts a block.',
    )
  })
})

describe('sendLabel', () => {
  test('Resend once an answer was sent, Send otherwise', () => {
    expect(sendLabel(1, sentAnswer())).toBe('Resend Q1')
    expect(sendLabel(3, dontSent())).toBe('Send Q3')
    expect(sendLabel(4, undefined)).toBe('Send Q4')
  })
})

describe('sentStatus', () => {
  test('nothing for a question never sent', () => {
    expect(sentStatus(undefined)).toBeNull()
  })
  test('"I don’t have this" is greyed: not added', () => {
    expect(sentStatus(dontSent())).toEqual({ text: 'Not added: you don’t have it', not: true })
  })
  test('sent but not placed yet', () => {
    expect(sentStatus(sentAnswer({ experienceTitle: '' }))).toEqual({ text: '✓ Sent: the AI is choosing where it goes', not: false })
  })
  test('added, or resent, to the experience', () => {
    expect(sentStatus(sentAnswer())).toEqual({ text: '✓ Added to Visio AI', not: false })
    expect(sentStatus(sentAnswer({ resent: true }))).toEqual({ text: '✓ Resent to Visio AI', not: false })
  })
})

describe('sentRows', () => {
  const asks = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }]
  test('splits sent answers into added and not added, numbered by question order', () => {
    const { added, notAdded } = sentRows(asks, { a1: sentAnswer(), a3: dontSent(), a4: sentAnswer({ experienceTitle: 'Cloud course' }) })
    expect(added.map((r) => [r.askId, r.n])).toEqual([
      ['a1', 1],
      ['a4', 4],
    ])
    expect(notAdded.map((r) => [r.askId, r.n])).toEqual([['a3', 3]])
  })
  test('leaves out unsent questions and blank answers', () => {
    const { added, notAdded } = sentRows(asks, { a2: sentAnswer({ answer: '  ' }) })
    expect(added).toEqual([])
    expect(notAdded).toEqual([])
  })
})

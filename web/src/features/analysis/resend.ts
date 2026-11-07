// Answering the AI's questions: each answer's state, and what sending (or resending) one does. Pure, and
// the same rules as the approved prototype's ansState / canSend / sendHint / sentStatus
// (prototype/job-analysis-v2.html): the popover's sent mode resends only the question you changed.
import type { SentAnswer } from './types'

/** A question's state on its card and its tab: nothing yet, answered, or "I don't have this". */
export type AnswerState = 'empty' | 'done' | 'dont'

export function answerState(text: string | undefined, dont: boolean | undefined): AnswerState {
  if (dont) return 'dont'
  return (text ?? '').trim() ? 'done' : 'empty'
}

/** A chip's prompt on a new paragraph after what you wrote: "+ A number or result" adds "A number or result: ". */
export function appendChip(text: string, chip: string): string {
  const body = text.replace(/\s+$/, '')
  return `${body ? `${body}\n\n` : ''}${chip}: `
}

/** An answer shortened for a one-line summary: at most `max` characters, ending in "…". */
export function clip(text: string, max = 52): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** What was sent for one question: the text (null = "I don't have this"), where it went, and if it was resent. */
type SentFacts = { text: string | null; dont: boolean; to: string | null; resent: boolean }

function sentFacts(sent: SentAnswer | undefined): SentFacts {
  if (!sent) return { text: null, dont: false, to: null, resent: false }
  return { text: sent.answer, dont: sent.answer === null, to: sent.experienceTitle.trim() || null, resent: sent.resent }
}

/** One question in the popover's sent mode: what is in the box now, and what was sent before. */
export type SendInput = {
  /** The question's number: Q1 = 1. */
  n: number
  text: string
  dont: boolean
  sent: SentAnswer | undefined
}

/** Something new to send: a changed answer, a first answer, or a new "I don't have this". */
export function canSend({ text, dont, sent }: SendInput): boolean {
  const was = sentFacts(sent)
  if (dont) return !was.dont
  const now = text.trim()
  return Boolean(now) && (was.dont || now !== (was.text ?? '').trim())
}

/** The line next to Send / Resend: why it is off, or what sending does. */
export function sendHint(input: SendInput): string {
  const { n, dont } = input
  const was = sentFacts(input.sent)
  if (!canSend(input)) {
    if (dont) return ''
    if (was.resent) return 'Sent. The AI is redoing the drafts that use it.'
    return was.text ? 'Change the answer to resend it.' : 'Write your answer to send it.'
  }
  if (dont) return `Removes what Q${n} added${was.to ? ` to ${was.to}` : ''}.`
  return was.to && was.text
    ? `Replaces only what Q${n} added to ${was.to}. The rest of its notes stay as they are.`
    : 'The AI adds it to the experience it is about and drafts a block.'
}

/** "Resend Q1" once an answer was sent; "Send Q1" before that, and after "I don't have this". */
export function sendLabel(n: number, sent: SentAnswer | undefined): string {
  return `${sentFacts(sent).text ? 'Resend' : 'Send'} Q${n}`
}

export type SentStatus = { text: string; not: boolean }

/** Where a sent answer stands (`not` = greyed); null when nothing was sent for this question. */
export function sentStatus(sent: SentAnswer | undefined): SentStatus | null {
  if (!sent) return null
  const was = sentFacts(sent)
  if (was.dont) return { text: 'Not added: you don’t have it', not: true }
  if (!was.to) return { text: '✓ Sent: the AI is choosing where it goes', not: false }
  return { text: `✓ ${was.resent ? 'Resent to' : 'Added to'} ${was.to}`, not: false }
}

/** A sent answer in the answers list; `n` follows the questions' order (Q1 = the first question). */
export type SentRow = { askId: string; n: number; sent: SentAnswer }

/** The answers list after sending: added to Experiences, and "I don't have this" (not added). */
export function sentRows(asks: readonly { id: string }[], sent: Record<string, SentAnswer>): { added: SentRow[]; notAdded: SentRow[] } {
  const rows = asks.flatMap((a, i) => (sent[a.id] ? [{ askId: a.id, n: i + 1, sent: sent[a.id] }] : []))
  return {
    added: rows.filter((r) => r.sent.answer !== null && r.sent.answer.trim()),
    notAdded: rows.filter((r) => r.sent.answer === null),
  }
}

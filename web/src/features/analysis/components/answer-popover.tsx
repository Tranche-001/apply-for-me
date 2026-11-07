'use client'

// Answering one of the AI's questions (the prototype's ansPopover): Q1–Q4 tabs, the question, what the job
// says, a roomy box with prompt chips and "I don’t have this". Live mode walks the questions (Previous /
// Next / Done, Ctrl+Enter = next); sent mode reopens a sent answer to change it and resend only that one.
import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { AiAsk } from '@/features/ai/types'
import { answerState, appendChip, canSend, sendHint, sendLabel, sentStatus } from '../resend'
import type { SentAnswer } from '../types'
import { c } from './ui/cx'
import { Marked } from './ui/marked'
import { Modal } from './ui/modal'

export type Props = {
  asks: AiAsk[]
  /** The question shown. */
  askId: string
  /** `live`: answering before sending; `sent`: changing an answer already sent, to resend it. */
  mode: 'live' | 'sent'
  answers: Record<string, string>
  dont: Record<string, boolean>
  sent: Record<string, SentAnswer>
  /** The posting's words behind the question's requirement (the first quote shows as "The job says"). */
  quoteFor(askId: string): { quotes: string[]; keys: string[] } | null
  /** The saved posting (postingLines()); "Open job posting" shows only when there is one. */
  postingLines: string[]
  busy: boolean
  onAnswer(askId: string, text: string): void
  onDont(askId: string, dont: boolean): void
  onGo(askId: string): void
  /** Done, ×, Esc or a click outside: close the popover. */
  onDone(): void
  onOpenPosting(askId: string): void
  onSend(askId: string): void
}

const CHIPS = ['Something I did', 'A number or result', 'What was hard'] as const

const PLACEHOLDER = 'In your own words: what you did, where, with which tools, and what came out of it. Numbers help.'
const PLACEHOLDER_DONT = 'You don’t have it: the AI won’t draft this.'

/** Focus the box with the caret after the last character (unless it is off: "I don’t have this"). */
function focusAtEnd(el: HTMLTextAreaElement | null): void {
  if (!el || el.disabled) return
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

export function AnswerPopover(props: Props) {
  const { asks, askId, mode, answers, dont, sent, quoteFor, postingLines, busy, onAnswer, onDont, onGo, onDone, onOpenPosting, onSend } = props
  const index = asks.findIndex((a) => a.id === askId)
  const ask = asks[index]
  const n = index + 1
  const text = answers[askId] ?? ''
  const isDont = Boolean(dont[askId])
  const box = useRef<HTMLTextAreaElement>(null)
  /** A chip changed the text: put the caret after the prompt once the new text is in the box. */
  const caretAfterChip = useRef(false)

  // Switching questions (or unticking "I don’t have this") keeps you typing: box focused, caret at the end.
  useEffect(() => {
    focusAtEnd(box.current)
  }, [askId, isDont])

  useEffect(() => {
    if (!caretAfterChip.current) return
    caretAfterChip.current = false
    focusAtEnd(box.current)
  }, [text])

  if (!ask) return null

  const next = asks[index + 1]
  const prev = asks[index - 1]
  const quote = quoteFor(askId)
  const said = quote?.quotes[0]?.trim()

  const addChip = (chip: string) => {
    caretAfterChip.current = true
    onAnswer(askId, appendChip(text, chip))
  }

  // Ctrl/⌘+Enter goes to the next question, or closes on the last one; a sent answer is resent on purpose only.
  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (mode === 'sent' || ev.key !== 'Enter' || !(ev.ctrlKey || ev.metaKey)) return
    ev.preventDefault()
    if (next) onGo(next.id)
    else onDone()
  }

  return (
    <Modal label="Questions about the gaps" onClose={onDone}>
      <div className={c('a-pop ans-pop')} onKeyDown={onKeyDown}>
        <div className={c('req-h')}>
          <h3>Questions about the gaps</h3>
          <button className={c('x')} type="button" aria-label="Close" onClick={onDone}>
            ×
          </button>
        </div>
        <div className={c('ans-tabs')} role="tablist" aria-label="Questions">
          {asks.map((a, i) => (
            <button
              key={a.id}
              className={c('ans-tab', answerState(answers[a.id], dont[a.id]), a.id === askId && 'on')}
              type="button"
              role="tab"
              aria-selected={a.id === askId}
              onClick={() => onGo(a.id)}
            >
              <span className={c('dot')} />
              {`Q${i + 1}`}
            </button>
          ))}
          <span className={c('sp')} />
          <span className={c('ans-count')}>{`${n} of ${asks.length}`}</span>
        </div>
        <p className={c('ans-q')}>{ask.text}</p>
        {said && (
          <div className={c('ans-why')}>
            <div className={c('ans-why-h')}>
              <span className={c('pv-k')}>The job says</span>
              {postingLines.length > 0 && (
                <button className={c('a-link2')} type="button" onClick={() => onOpenPosting(askId)}>
                  Open job posting
                </button>
              )}
            </div>
            <q>
              <Marked text={said} phrases={quote?.keys ?? []} tone="job" />
            </q>
          </div>
        )}
        <textarea
          ref={box}
          className={c('a-ta ans-ta')}
          aria-label={`Your answer to Q${n}`}
          disabled={isDont}
          placeholder={isDont ? PLACEHOLDER_DONT : PLACEHOLDER}
          value={text}
          onChange={(ev) => onAnswer(askId, ev.target.value)}
        />
        <div className={c('ans-tools')}>
          <div className={c('a-chips')}>
            {CHIPS.map((chip) => (
              <button key={chip} type="button" className={c('a-chip-btn')} onClick={() => addChip(chip)}>
                {`+ ${chip}`}
              </button>
            ))}
          </div>
          <label className={c('ans-dont')}>
            <input type="checkbox" checked={isDont} onChange={(ev) => onDont(askId, ev.target.checked)} />I don’t have this
          </label>
        </div>
        {mode === 'sent' ? (
          <SentFoot n={n} text={text} dont={isDont} sent={sent[askId]} busy={busy} onSend={() => onSend(askId)} />
        ) : (
          <div className={c('foot')}>
            <button className={c('a-btn')} type="button" disabled={!prev} onClick={() => prev && onGo(prev.id)}>
              {prev ? `← Q${n - 1}` : '← Previous'}
            </button>
            <span className={c('sp')} />
            <span className={c('ans-kbd')}>
              <kbd>Ctrl</kbd> + <kbd>Enter</kbd> next
            </span>
            {next ? (
              <button className={c('a-btn p')} type="button" onClick={() => onGo(next.id)}>
                {`Next: Q${n + 1} →`}
              </button>
            ) : (
              <button className={c('a-btn p')} type="button" onClick={onDone}>
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

type SentFootProps = { n: number; text: string; dont: boolean; sent: SentAnswer | undefined; busy: boolean; onSend(): void }

/** Where the sent answer is, what sending again would do, and "Resend Qn" (on only when something changed). */
function SentFoot({ n, text, dont, sent, busy, onSend }: SentFootProps) {
  const input = { n, text, dont, sent }
  const status = sentStatus(sent)
  return (
    <div className={c('foot')}>
      {status && <span className={c('ans-sent', status.not && 'not')}>{status.text}</span>}
      <span className={c('sp')} />
      <span className={c('ans-hint')}>{sendHint(input)}</span>
      <button className={c('a-btn p')} type="button" disabled={busy || !canSend(input)} onClick={onSend}>
        {sendLabel(n, sent)}
      </button>
    </div>
  )
}

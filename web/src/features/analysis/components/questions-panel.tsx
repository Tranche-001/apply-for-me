// "Questions about the gaps" (the prototype's qPanel): each question is a card with its state ("Answer ›",
// "✓ Answered" with the start of the answer, or "Don’t have it"); clicking one opens the answer popover.
// Before the analysis lists them, the panel only says what it is for.
import type { AiAsk } from '@/features/ai/types'
import { answerState, type AnswerState } from '../resend'
import { c } from './ui/cx'

export type Props = {
  /** `empty` while the AI reads and compares (no questions yet); `cards` once it asks. */
  mode: 'empty' | 'cards'
  asks: AiAsk[]
  answers: Record<string, string>
  dont: Record<string, boolean>
  /** The amber line under an unanswered question, e.g. "Can fill the gap in the BI Dashboard draft." */
  hintFor(askId: string): string | null
  busy: boolean
  onOpen(askId: string): void
  onUpdateDrafts(): void
}

const SUB = 'Answer what you can. Skip the rest. When you send, the AI adds each answer to the experience it is about.'

const STATE_LABEL: Record<AnswerState, string> = { done: '✓ Answered', dont: 'Don’t have it', empty: 'Answer ›' }

/** The prototype's "spark" icon (the AI does something). */
const SPARK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  </svg>
)

export function QuestionsPanel({ mode, asks, answers, dont, hintFor, busy, onOpen, onUpdateDrafts }: Props) {
  if (mode === 'empty') {
    return (
      <section className={c('a-panel')}>
        <h3>Questions about the gaps</h3>
        <p className={c('a-sub')}>{SUB}</p>
        <div className={c('a-sep')} />
        <p className={c('a-sub')}>The AI asks here instead of guessing what you did.</p>
      </section>
    )
  }
  const count = asks.filter((a) => answerState(answers[a.id], dont[a.id]) !== 'empty').length
  const off = count === 0 || busy
  return (
    <section className={c('a-panel')}>
      <h3>Questions about the gaps</h3>
      <p className={c('a-sub')}>{SUB}</p>
      <p className={c('q-progress')}>{`${count} of ${asks.length} answered · click a question to answer it`}</p>
      {asks.map((ask, i) => (
        <QuestionCard key={ask.id} ask={ask} n={i + 1} answer={answers[ask.id] ?? ''} dont={Boolean(dont[ask.id])} hintFor={hintFor} onOpen={onOpen} />
      ))}
      <button className={c('a-btn p', off && 'dis')} type="button" disabled={off} onClick={onUpdateDrafts}>
        {SPARK}
        Update drafts with my answers
      </button>
    </section>
  )
}

type CardProps = { ask: AiAsk; n: number; answer: string; dont: boolean; hintFor(askId: string): string | null; onOpen(askId: string): void }

/** One question (3 lines at most), what you answered in serif, and its state pill. */
function QuestionCard({ ask, n, answer, dont, hintFor, onOpen }: CardProps) {
  const st = answerState(answer, dont)
  const label = STATE_LABEL[st]
  const hint = st === 'empty' ? hintFor(ask.id) : null
  return (
    <button className={c('q-card')} type="button" aria-label={`Q${n}: ${label}`} onClick={() => onOpen(ask.id)}>
      <span className={c('q-n')}>{`Q${n}`}</span>
      <span className={c('q-body')}>
        <span className={c('q-text')}>{ask.text}</span>
        {st === 'done' && <span className={c('q-ans')}>{`“${answer.trim()}”`}</span>}
        {hint && <span className={c('q-hint')}>{hint}</span>}
        <span className={c('q-st', st)}>{label}</span>
      </span>
    </button>
  )
}

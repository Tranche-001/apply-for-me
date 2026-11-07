// "Questions about the gaps" after the answers were sent (the prototype's donePanel): where each answer went,
// and which you don't have. A sent answer reopens in the popover to change it and resend only that question;
// a "not added" one offers to add an experience that shows it.
import type { AiAsk } from '@/features/ai/types'
import { clip, sentRows, type SentRow } from '../resend'
import type { SentAnswer } from '../types'
import { c } from './ui/cx'

export type Props = {
  asks: AiAsk[]
  sent: Record<string, SentAnswer>
  /** The short name of what a question is about, e.g. "Kafka" ("Kafka · not added"). */
  topicFor(askId: string): string
  onOpen(askId: string): void
  onAddExperience(askId: string): void
}

/** The prototype's "exp" icon: an experience (notebook with a pen). */
const EXP = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
    <path d="M2 6h4" />
    <path d="M2 10h4" />
    <path d="M2 14h4" />
    <path d="M2 18h4" />
    <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
  </svg>
)

const plural = (k: number) => `${k} answer${k === 1 ? '' : 's'}`

export function AnswersDone({ asks, sent, topicFor, onOpen, onAddExperience }: Props) {
  const { added, notAdded } = sentRows(asks, sent)
  return (
    <section className={c('a-panel')}>
      <h3>Questions about the gaps</h3>
      <p className={c('a-sub')}>Click an answer to see it, change it and resend it.</p>
      <div className={c('a-sep')} />
      <div className={c('a-filed flush')}>
        {added.length > 0 && (
          <>
            <p className={c('a-filed-h')}>
              <i>✓</i>
              {`${plural(added.length)} added to your Experiences`}
            </p>
            {added.map((row) => (
              <AddedRow key={row.askId} row={row} onOpen={onOpen} />
            ))}
          </>
        )}
        {notAdded.length > 0 && (
          <>
            <p className={c('a-filed-h not')}>
              <i>!</i>
              {`${plural(notAdded.length)} not added`}
            </p>
            {notAdded.map((row) => (
              <NotAddedRow key={row.askId} row={row} topic={topicFor(row.askId)} onAddExperience={onAddExperience} />
            ))}
          </>
        )}
      </div>
    </section>
  )
}

/** An answer added to an experience: the experience (NEW when the AI created it), the answer, "Edit ›". */
function AddedRow({ row, onOpen }: { row: SentRow; onOpen(askId: string): void }) {
  const { askId, n, sent } = row
  const to = sent.experienceTitle.trim() || null
  return (
    <button className={c('a-filed-row edit')} type="button" aria-label={`Q${n}: see your answer, change it and resend it`} onClick={() => onOpen(askId)}>
      <span className={c('ex')}>{EXP}</span>
      <span>
        <b>
          {to ?? 'The AI is choosing a place'}
          {to && sent.isNewExperience && <span className={c('a-badge')}>NEW</span>}
        </b>
        <small>{`Q${n}${sent.resent ? ' · resent' : ''} · “${clip((sent.answer ?? '').trim())}”`}</small>
      </span>
      <span className={c('ed')}>Edit ›</span>
    </button>
  )
}

/** "I don't have this", sent: nothing was added; "+ Add experience" in case you have done it since. */
function NotAddedRow({ row, topic, onAddExperience }: { row: SentRow; topic: string; onAddExperience(askId: string): void }) {
  return (
    <button
      className={c('a-filed-row skip')}
      type="button"
      aria-label={`${topic} was not added: add an experience that shows it`}
      onClick={() => onAddExperience(row.askId)}
    >
      <span className={c('ex')}>!</span>
      <span>
        <b>{`${topic} · not added`}</b>
        <small>{`Q${row.n} · You said you don’t have it. Have you done it since?`}</small>
      </span>
      <span className={c('go')}>+ Add experience</span>
    </button>
  )
}

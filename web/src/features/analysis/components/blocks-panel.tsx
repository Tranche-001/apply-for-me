'use client'

// "Blocks for this CV" (the prototype's madePanel): every block the CV will use, written out; the undo
// line after a discard (H3), "Ask for changes" (H4: the same box wherever the AI writes) and "Review the CV".
import { useState } from 'react'
import { DraftCard, type Props as DraftCardProps } from './draft-card'
import { c } from './ui/cx'

const SPARK = 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z'

export type BlockCard = DraftCardProps & { key: string }

export type Props = {
  cards: BlockCard[]
  /** "1 new version · 3 as is", from blocksSummary(). */
  summary: string
  /** "Discarded BI Dashboard.", from discardedLabel(); null hides the undo line. */
  undoLabel: string | null
  /** The AI is working: no new request until it ends. */
  busy: boolean
  onUndo: () => void
  onAskChanges: (text: string) => void
  onReview: () => void
}

function AskForChanges({ busy, onAskChanges }: Pick<Props, 'busy' | 'onAskChanges'>) {
  const [text, setText] = useState('')
  const send = () => {
    const ask = text.trim()
    if (!ask || busy) return
    onAskChanges(ask)
    setText('')
  }
  return (
    <div className={c('a-ask')}>
      <input
        type="text"
        value={text}
        onChange={(ev) => setText(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key !== 'Enter' || ev.nativeEvent.isComposing) return
          ev.preventDefault()
          send()
        }}
        placeholder="Ask for changes, e.g. shorter bullets, lead with Gemini"
        aria-label="Ask for changes"
      />
      <button className={c('a-icon')} type="button" onClick={send} disabled={busy} aria-label="Send the changes to the AI">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={SPARK} />
        </svg>
      </button>
    </div>
  )
}

export function BlocksPanel({ cards, summary, undoLabel, busy, onUndo, onAskChanges, onReview }: Props) {
  const empty = cards.length === 0
  return (
    <section className={c('a-panel')}>
      <h3>
        Blocks for this CV <small>{summary}</small>
      </h3>
      {empty && (
        <p className={c('a-sub')}>
          The blocks this CV will use appear here, written out: new versions the AI writes (Keep, Edit, Discard) and the ones that already fit, as they are.
        </p>
      )}
      {cards.map(({ key, ...card }) => (
        <DraftCard key={key} {...card} />
      ))}
      {undoLabel && (
        <p className={c('a-sub')} role="status">
          {undoLabel}{' '}
          <button className={c('a-link-btn')} type="button" onClick={onUndo}>
            Undo
          </button>
        </p>
      )}
      <AskForChanges busy={busy} onAskChanges={onAskChanges} />
      {empty ? (
        <button className={c('a-btn dis')} type="button" aria-disabled="true">
          Nothing to review yet
        </button>
      ) : (
        <button className={c('a-btn p')} type="button" onClick={onReview} disabled={busy}>
          Review the CV
        </button>
      )}
    </section>
  )
}

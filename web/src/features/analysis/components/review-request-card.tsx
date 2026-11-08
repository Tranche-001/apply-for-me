// REVIEW after the CV appears (prototype next-ideas.html #review): "How should this CV be better?", "Remember this for
// next CVs", "Make a new CV" with its status; then Before / After and Keep Before / Keep After, with what the AI
// changed (P2). The page below shows the CV picked in Before / After.
import { useId, useState } from 'react'
import type { AiReportLine } from '../../ai/types'
import { c } from './ui/cx'
import type { ReviewProblem, ReviewShow } from './use-cv-review'

export type Props = {
  /** The open review: his request and what the AI changed; null = none to compare. */
  review: { request: string; remember: boolean; report: AiReportLine[] } | null
  showing: ReviewShow
  busy: 'making' | 'learning' | null
  status: string | null
  problem: ReviewProblem | null
  /** Saved, or the pipeline is busy elsewhere. */
  disabled: boolean
  onMake: (request: string, remember: boolean) => void
  onShow: (which: ReviewShow) => void
  onKeep: (which: ReviewShow) => void
}

export function ReviewRequestCard({ review, showing, busy, status, problem, disabled, onMake, onShow, onKeep }: Props) {
  const id = useId()
  const [open, setOpen] = useState(Boolean(review))
  const [text, setText] = useState(review?.request ?? '')
  const [remember, setRemember] = useState(review?.remember ?? false)
  const off = disabled || busy !== null
  return (
    <section className={c('tt-card')} aria-labelledby={`${id}-h`}>
      <div className={c('rv-head')}>
        <h4 id={`${id}-h`}>Review this CV</h4>
        <button type="button" className={c('a-btn sm rv-open')} aria-expanded={open} aria-controls={`${id}-box`} onClick={() => setOpen((o) => !o)}>
          REVIEW
        </button>
      </div>
      {open && (
        <div className={c('rv-box')} id={`${id}-box`}>
          <label htmlFor={`${id}-text`}>
            <b>How should this CV be better?</b>
          </label>
          <textarea
            id={`${id}-text`}
            value={text}
            maxLength={1000}
            disabled={off}
            placeholder="e.g. Put company experience first. Use AI Builder as my title at Visio."
            onChange={(e) => setText(e.target.value)}
          />
          <label className={c('rv-check')}>
            <input type="checkbox" checked={remember} disabled={off} onChange={(e) => setRemember(e.target.checked)} /> Remember this for next CVs
          </label>
          <div className={c('rv-row')}>
            <button type="button" className={c('a-btn p')} disabled={off || !text.trim()} onClick={() => onMake(text.trim(), remember)}>
              Make a new CV
            </button>
            <span className={c('rv-status')} role="status">
              {busy || !problem ? status : null}
            </span>
          </div>
          {problem && !busy && (
            <div className={c('rv-row')} role="alert">
              <span className={c('rv-status')}>{problem.message}</span>
              <button type="button" className={c('a-btn sm')} onClick={problem.retry}>
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      {review && (
        <>
          <div className={c('rv-compare')}>
            <span className={c('a-seg')} role="group" aria-label="Compare CVs">
              {(['before', 'after'] as const).map((w) => (
                <button key={w} type="button" aria-pressed={showing === w} className={c(showing === w && 'on')} onClick={() => onShow(w)}>
                  {w === 'before' ? 'Before' : 'After'}
                </button>
              ))}
            </span>
            <span className={c('rv-row')}>
              <button type="button" className={c('a-btn')} disabled={off} onClick={() => onKeep('before')}>
                Keep Before
              </button>
              <button type="button" className={c('a-btn p')} disabled={off} onClick={() => onKeep('after')}>
                Keep After
              </button>
            </span>
          </div>
          {review.report.length > 0 && (
            <ul className={c('rv-report')} aria-label="What the AI changed">
              {review.report.map((l, i) => (
                <li key={i}>
                  <b>{l.tag}</b>
                  {l.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

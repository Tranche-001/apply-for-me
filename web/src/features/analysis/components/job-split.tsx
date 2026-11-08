'use client'

// Frame "split": what was read holds more than one job. One card per job (a radio-like button), you pick one,
// and only that job is created and compared with your blocks. Nothing is saved before the pick.
import { useState } from 'react'
import { Icon } from '../../ai/ui/icon'
import type { SplitCandidate } from '../actions'
import { c } from './ui/cx'

export type Props = {
  candidates: SplitCandidate[]
  /** A flow is running (starting the picked job): the choice is locked. */
  busy: boolean
  /** Called as the pick changes (the pick itself is held here). */
  onPick?: (candidateId: string) => void
  onAnalyze: (candidateId: string) => void
  /** "← Use another link": back to the start card, what was typed is still there. */
  onBack: () => void
}

export function JobSplit({ candidates, busy, onPick, onAnalyze, onBack }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const pick = (id: string) => {
    setPicked(id)
    onPick?.(id)
  }
  const chosen = candidates.find((x) => x.id === picked) ?? null
  return (
    <div className={c('a-split')}>
      <h3>This link has {candidates.length} jobs</h3>
      <p className={c('a-sub')}>The AI split what it read into the jobs it found, each with its own text. Pick the one to analyze now.</p>
      <div className={c('jp-list')}>
        {candidates.map((job) => (
          <button key={job.id} className={c('jp', job.id === picked && 'on')} type="button" aria-pressed={job.id === picked} disabled={busy} onClick={() => pick(job.id)}>
            <span className={c('jp-top')}>
              <span className={c('jp-dot')} aria-hidden="true" />
              <b>{job.role}</b>
            </span>
            {job.meta && <span className={c('meta')}>{job.meta}</span>}
            {job.lines.length > 0 && (
              <span className={c('lines')}>
                {job.lines.map((line) => (
                  <q key={line}>{line}</q>
                ))}
              </span>
            )}
            <span className={c('count')}>
              {job.requirementCount} {job.requirementCount === 1 ? 'requirement' : 'requirements'} found
            </span>
          </button>
        ))}
      </div>
      <div className={c('foot')}>
        <button className={c('a-link-btn')} type="button" onClick={onBack} disabled={busy}>
          ← Use another link
        </button>
        <span className={c('sp')} />
        {!chosen && <span className={c('a-hint')}>Pick a job first</span>}
        <button className={c('a-btn p')} type="button" disabled={!chosen || busy} onClick={() => chosen && onAnalyze(chosen.id)}>
          <Icon name="sparkle" />
          Analyze this job
        </button>
      </div>
    </div>
  )
}

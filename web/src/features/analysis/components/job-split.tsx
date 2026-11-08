'use client'

// Frame "split": what was read holds more than one job, or one posting with several tracks. One card per job
// (a radio-like button), you pick one, and only that job is created and compared with your blocks. Nothing is
// saved before the pick. A track keeps the posting's shared part (intro, general requirements, benefits).
import { useState } from 'react'
import { Icon } from '../../ai/ui/icon'
import type { SplitCandidate, StartSource } from '../start-types'
import { splitHeading } from './start-links'
import { c } from './ui/cx'

export type Props = {
  candidates: SplitCandidate[]
  /** Where the text came from: "This link / These links / This text has N jobs". */
  source: StartSource
  /** A flow is running (starting the picked job): the choice is locked. */
  busy: boolean
  /** Called as the pick changes (the pick itself is held here). */
  onPick?: (candidateId: string) => void
  onAnalyze: (candidateId: string) => void
  /** "← Use another link": back to the start card, what was typed is still there. */
  onBack: () => void
}

function Card({ job, on, busy, onPick }: { job: SplitCandidate; on: boolean; busy: boolean; onPick: () => void }) {
  return (
    <button className={c('jp', on && 'on')} type="button" aria-pressed={on} disabled={busy} onClick={onPick}>
      <span className={c('jp-top')}>
        <span className={c('jp-dot')} aria-hidden="true" />
        <b>{job.role}</b>
        {job.track && <span className={c('jp-tag')}>Track</span>}
      </span>
      {job.meta && <span className={c('meta')}>{job.meta}</span>}
      {job.track && job.startsWith ? (
        <span className={c('starts')}>Starts: “{job.startsWith}”</span>
      ) : (
        job.lines.length > 0 && (
          <span className={c('lines')}>
            {job.lines.map((line) => (
              <q key={line}>{line}</q>
            ))}
          </span>
        )
      )}
      <span className={c('count')}>
        {job.requirementCount} {job.requirementCount === 1 ? 'requirement' : 'requirements'} found
      </span>
    </button>
  )
}

export function JobSplit({ candidates, source, busy, onPick, onAnalyze, onBack }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const pick = (id: string) => {
    setPicked(id)
    onPick?.(id)
  }
  const chosen = candidates.find((x) => x.id === picked) ?? null
  const tracks = candidates.every((x) => x.track)
  const heading = splitHeading(candidates.length, source, tracks)
  const shared = tracks ? (candidates[0]?.shared ?? []) : []
  return (
    <div className={c('a-split')}>
      <h3>{heading.title}</h3>
      <p className={c('a-sub')}>{heading.sub}</p>
      <div className={c('jp-list')}>
        {candidates.map((job) => (
          <Card key={job.id} job={job} on={job.id === picked} busy={busy} onPick={() => pick(job.id)} />
        ))}
      </div>
      {shared.length > 0 && <p className={c('a-hint')}>Shared part kept in {candidates.length === 2 ? 'both' : 'each'}: {shared.join(' · ')}</p>}
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

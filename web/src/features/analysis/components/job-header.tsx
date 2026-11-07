'use client'

// The prototype's head() + jobLine(mode): the screen title, then the job the AI filled in from the posting.
// The job is read-only here (renaming lives on Jobs); a resumed analysis offers "Analyze again".
import { Icon } from '@/features/ai/ui/icon'
import { c } from './ui/cx'

export type JobLineMode = 'none' | 'creating' | 'job' | 'resumed'

export type Props = {
  mode: JobLineMode
  job: { label: string; url: string | null } | null
  /** ISO date of the saved analysis (mode 'resumed'), shown like "Nov 7, 10:42". */
  analyzedAt?: string | null
  busy?: boolean
  onAnalyzeAgain?: () => void
}

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : WHEN.format(d)
}

/** "jobs.exampleco.com" for an http(s) link; null for anything else, so no other scheme becomes a link. */
function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

function LinkChip({ url }: { url: string | null }) {
  const host = hostOf(url)
  if (!url || !host) return null
  return (
    <a className={c('a-chip')} href={url} target="_blank" rel="noopener noreferrer" title={url}>
      <Icon name="link" />
      {host}
    </a>
  )
}

function JobLine({ mode, job, analyzedAt, busy = false, onAnalyzeAgain }: Props) {
  if (mode === 'none') return null
  if (mode === 'creating') {
    return (
      <div className={c('a-jobline')}>
        Job <span className={c('a-skel')} style={{ width: 210 }} aria-hidden="true" />
        <span className={c('a-skel')} style={{ width: 120 }} aria-hidden="true" />
        <span>The AI is filling in the job from the posting…</span>
      </div>
    )
  }
  if (!job) return null
  if (mode === 'resumed') {
    const when = formatWhen(analyzedAt)
    return (
      <div className={c('a-jobline')}>
        Job <b>{job.label}</b>
        <LinkChip url={job.url} />
        {when && (
          <span className={c('a-last')} suppressHydrationWarning>
            {`Last analysis: ${when} · saved with the job`}
          </span>
        )}
        {onAnalyzeAgain && (
          <button className={c('a-btn sm')} type="button" onClick={onAnalyzeAgain} disabled={busy}>
            <Icon name="sparkle" />
            Analyze again
          </button>
        )}
      </div>
    )
  }
  return (
    <div className={c('a-jobline')}>
      Job <b>{job.label}</b>
      <LinkChip url={job.url} />
      <span>Filled in by the AI from the posting</span>
    </div>
  )
}

export function JobHeader(props: Props) {
  return (
    <>
      <div className={c('a-head')}>
        <div>
          <div className={c('a-eyebrow')}>JOB ANALYSIS</div>
          <h1 className={c('a-title')}>Turn a job posting into blocks</h1>
        </div>
      </div>
      <JobLine {...props} />
    </>
  )
}

'use client'

// Header of Job analysis: which job, its links, a box for the posting link(s) and Analyze.
// "+ New job" creates one in place; a job that already exists is opened instead (H5).
import { useState } from 'react'
import { NOT_READY } from '@/features/ai/provider'
import { Icon } from '@/features/ai/ui/icon'
import type { JobSummary } from '../types'

type Props = {
  jobs: JobSummary[]
  job: JobSummary | null
  onPickJob: (id: string) => void
  onCreateJob: (company: string, role: string) => Promise<string | null>
  urlInput: string
  onUrlInput: (v: string) => void
  onAnalyze: () => void
  busy: boolean
  aiReady: boolean
}

const KIND_LABEL = { POSTING: 'Job posting', APPLICATION: 'Application', COMPANY: 'Company site', OTHER: 'Link' } as const

export function JobBar({ jobs, job, onPickJob, onCreateJob, urlInput, onUrlInput, onAnalyze, busy, aiReady }: Props) {
  const [creating, setCreating] = useState(false)
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submitNew = async () => {
    setSubmitting(true)
    const error = await onCreateJob(company, role)
    setSubmitting(false)
    setCreateError(error)
    if (!error) {
      setCreating(false)
      setCompany('')
      setRole('')
    }
  }

  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-none flex-col gap-px">
          <p className="eyebrow">JOB ANALYSIS</p>
          <h1 className="page-title">Turn a job posting into blocks</h1>
        </div>
        <form
          className="flex min-w-0 flex-[1_1_380px] gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            onAnalyze()
          }}
        >
          <label htmlFor="job-url" className="sr-only">
            Job posting URL
          </label>
          <div className="flex h-9 min-w-0 flex-auto items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-white px-2.5 text-[var(--muted)] focus-within:border-[var(--indigo)]">
            <Icon name="link" size={15} />
            <input
              id="job-url"
              value={urlInput}
              onChange={(e) => onUrlInput(e.target.value)}
              placeholder={job?.links.length ? 'Another link, or leave empty to read the saved ones' : 'https://… link to the job posting'}
              disabled={!job}
              className="min-w-0 flex-auto border-0 bg-transparent text-[13px] text-[var(--text)] outline-offset-4 placeholder:text-[#6b7180]"
            />
          </div>
          <button type="submit" className="btn-p h-9 flex-none rounded-lg px-3.5 text-[13px]" disabled={!job || busy || !aiReady}>
            <Icon name="sparkle" />
            {busy ? 'Working…' : 'Analyze'}
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {jobs.length > 0 && !creating && (
          <div className="flex items-center gap-2">
            <label htmlFor="job-pick" className="text-[12px] font-medium text-[var(--muted)]">
              Job
            </label>
            <select
              id="job-pick"
              value={job?.id ?? ''}
              onChange={(e) => onPickJob(e.target.value)}
              disabled={busy}
              className="h-8 max-w-[320px] rounded-md border border-[var(--border-strong)] bg-white px-2 text-[12.5px]"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {creating ? (
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              void submitNew()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCreating(false)
            }}
          >
            <label htmlFor="new-co" className="sr-only">
              Company
            </label>
            <input id="new-co" autoFocus value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="h-8 w-[160px] rounded-md border border-[var(--border-strong)] bg-white px-2 text-[12.5px]" />
            <label htmlFor="new-role" className="sr-only">
              Role
            </label>
            <input id="new-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role, e.g. Backend Engineer" className="h-8 w-[220px] rounded-md border border-[var(--border-strong)] bg-white px-2 text-[12.5px]" />
            <button type="submit" className="btn-p h-8" disabled={!role.trim() || submitting}>
              {submitting ? 'Creating…' : 'Create job'}
            </button>
            <button type="button" className="btn-s h-8" onClick={() => setCreating(false)}>
              Cancel
            </button>
            {createError && (
              <span role="alert" className="text-[12px] text-[var(--amber)]">
                {createError}
              </span>
            )}
          </form>
        ) : (
          <button
            type="button"
            className="btn-s h-8"
            disabled={busy}
            onClick={() => {
              setCreating(true)
              setCreateError(null)
            }}
          >
            <Icon name="plus" size={12} />
            New job
          </button>
        )}
        {job && job.links.length > 0 && (
          <ul aria-label="Links of this job" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {job.links.map((l) => (
              <li key={l.id}>
                <a
                  href={/^https?:\/\//i.test(l.url) ? l.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-6 max-w-[260px] items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2 text-[11.5px] text-[var(--text-2)] no-underline hover:border-[var(--indigo)]"
                >
                  <span className="font-medium">{KIND_LABEL[l.kind]}</span>
                  <span className="truncate text-[var(--muted)]">{l.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {job && job.postingChars > 0 && <span className="text-[11.5px] text-[var(--muted)]">Posting text saved ({job.postingChars.toLocaleString('en')} characters)</span>}
        {!aiReady && <span className="text-[12px] text-[var(--amber)]">{NOT_READY}</span>}
      </div>
    </header>
  )
}

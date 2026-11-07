'use client'

// Interview mode: every answered question for one job, one after the other, read only.
// The job's adapted answer when there is one, else the generalist one, labelled. Large text with A+.
import Link from 'next/link'
import { useState } from 'react'
import { interviewItems, type BehavioralData } from '../types'
import { BehavioralPills } from './behavioral-pills'

const SEG_ON = 'bg-white font-semibold text-[var(--text)] shadow-[0_1px_2px_rgba(20,22,27,0.1)]'
const SEG_OFF = 'bg-transparent font-medium text-[var(--muted)]'

export function InterviewScreen({ data, initialJobId }: { data: BehavioralData; initialJobId: string | null }) {
  const [jobId, setJobId] = useState(initialJobId)
  const [large, setLarge] = useState(false)
  const job = data.jobs.find((j) => j.id === jobId) ?? null
  const items = interviewItems(data.questions, data.tailored, jobId)
  const missing = data.questions.length - items.length
  const count = `${items.length} of ${data.questions.length} answered`

  const chooseJob = (id: string) => {
    setJobId(id)
    window.history.replaceState(null, '', `?job=${encodeURIComponent(id)}`)
  }

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.getElementById(`iv-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    window.history.replaceState(null, '', `${window.location.search}#iv-${id}`)
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-3.5 pb-14 pt-[18px]">
      <header className="flex flex-col gap-2.5">
        <p className="eyebrow text-[12px]">BEHAVIORAL</p>
        <h1 className="sr-only">Interview mode</h1>
        <BehavioralPills current="interview" jobId={jobId} />
        <p className="m-0 max-w-[660px] text-[14px] leading-[1.5] text-[var(--muted)]">
          Every answer you have for one job, one after the other. Keep it open while you are interviewed.
        </p>
      </header>

      <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[0_4px_12px_rgba(20,22,27,0.04)]">
        <div className="flex flex-col gap-px">
          <h2 className="m-0 text-[15px] font-semibold">{job ? `Your answers for ${job.company}` : 'Your answers'}</h2>
          <span className="text-[12px] text-[var(--muted)]">{count}</span>
        </div>
        <span className="flex-auto" />
        {data.jobs.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="iv-job" className="text-[12.5px] font-medium text-[var(--muted)]">
              Job
            </label>
            <select
              id="iv-job"
              value={jobId ?? ''}
              onChange={(e) => chooseJob(e.target.value)}
              className="h-[34px] rounded-lg border border-[var(--border-strong)] bg-white px-2 text-[13px]"
            >
              {data.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div role="group" aria-label="Text size" className="flex gap-[3px] rounded-lg bg-[#e6e7ea] p-[3px]">
          <button type="button" onClick={() => setLarge(false)} aria-pressed={!large} className={`h-7 rounded-md border-0 px-2.5 text-[12.5px] ${large ? SEG_OFF : SEG_ON}`}>
            A
          </button>
          <button type="button" onClick={() => setLarge(true)} aria-pressed={large} className={`h-7 rounded-md border-0 px-2.5 text-[15px] ${large ? SEG_ON : SEG_OFF}`}>
            A+
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <nav aria-label="Answered questions" className="sticky top-[76px] flex min-w-[220px] flex-[0_1_260px] flex-col gap-1.5">
          <span className="px-2.5 text-[12px] font-semibold text-[var(--muted)]">{count}</span>
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {items.map((q) => (
              <li key={q.id}>
                <a
                  href={`#iv-${q.id}`}
                  onClick={(e) => jump(e, q.id)}
                  className="flex gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] leading-[1.35] text-[#22252c] no-underline hover:bg-[#eef0f3] hover:text-[#22252c]"
                >
                  <span className="font-mono text-[12px] text-[var(--muted)]">{q.n}</span>
                  <span lang="pt-BR">{q.short}</span>
                </a>
              </li>
            ))}
          </ol>
          {missing > 0 && (
            <Link href={`/behavioral${jobId ? `?job=${encodeURIComponent(jobId)}` : ''}`} className="px-2.5 py-1 text-[12.5px] font-medium">
              {missing} {missing === 1 ? 'question has' : 'questions have'} no answer yet. Write in Behavioral
            </Link>
          )}
        </nav>

        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4">
          {items.map((q) => (
            <article key={q.id} id={`iv-${q.id}`} className="flex scroll-mt-[76px] flex-col gap-3 rounded-[14px] border border-[var(--border)] bg-white px-7 py-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                <span className="font-mono text-[13px] text-[var(--muted)]">{q.n}</span>
                <h2 lang="pt-BR" className="m-0 text-[21px] font-semibold leading-[1.3] tracking-[-0.01em]">
                  {q.short}
                </h2>
                <span
                  className={`rounded-full px-[9px] py-0.5 text-[11.5px] font-semibold ${
                    q.adapted ? 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)]' : 'bg-[#f1f2f4] text-[var(--text-2)]'
                  }`}
                >
                  {q.adapted && job ? `Adapted for ${job.company}` : 'Generalist'}
                </span>
              </div>
              <p lang="pt-BR" className="m-0 text-[13.5px] leading-[1.5] text-[var(--muted)]">
                {q.full}
              </p>
              <div lang="pt-BR" className={`whitespace-pre-wrap leading-[1.7] text-[var(--text)] ${large ? 'text-[21px]' : 'text-[17px]'}`}>
                {q.answer}
              </div>
              {q.looksFor.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[12px] font-semibold text-[var(--amber)]">Remember</span>
                  {q.looksFor.map((l) => (
                    <span key={l} lang="pt-BR" className="rounded-full border border-[var(--amber-line)] bg-[var(--amber-soft)] px-[9px] py-[3px] text-[12px] text-[var(--amber-ink)]">
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
          {items.length === 0 && (
            <p className="m-0 rounded-[14px] border border-dashed border-[#c9cdd4] bg-white p-8 text-center text-[14px] text-[var(--muted)]">
              No answers yet. Write them in <Link href="/behavioral">Behavioral</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

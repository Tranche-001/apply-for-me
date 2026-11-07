'use client'

// "What the job asks for": covered / partial / missing, with evidence; the job's name with a pencil to
// rename it (company + role, Enter keeps, Esc cancels). Versions made for the job follow the new name.
import { useState } from 'react'
import type { JobRequirement, RequirementStatus } from '@/features/ai/types'
import { Icon } from '@/features/ai/ui/icon'
import type { JobSummary } from '../types'

const TONE: Record<RequirementStatus, { icon: string; text: string; word: string; mark: 'check' | 'minus' | 'x' }> = {
  covered: { icon: 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)]', text: 'text-[var(--indigo-hover)]', word: 'COVERED', mark: 'check' },
  partial: { icon: 'bg-[var(--amber-soft)] text-[var(--amber)]', text: 'text-[var(--amber)]', word: 'PARTIAL', mark: 'minus' },
  missing: { icon: 'bg-[#f1f2f4] text-[var(--text-2)]', text: 'text-[var(--text-2)]', word: 'MISSING', mark: 'x' },
}

type Props = {
  job: JobSummary
  requirements: JobRequirement[] | null
  onRename: (company: string, role: string) => Promise<string | null>
}

function focusSoon(id: string) {
  setTimeout(() => document.getElementById(id)?.focus(), 40)
}

export function RequirementsPanel({ job, requirements, onRename }: Props) {
  const [renaming, setRenaming] = useState(false)
  const [company, setCompany] = useState(job.company)
  const [role, setRole] = useState(job.role)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const count = (s: RequirementStatus) => requirements?.filter((r) => r.status === s).length ?? 0

  const start = () => {
    setCompany(job.company)
    setRole(job.role)
    setError(null)
    setRenaming(true)
    focusSoon('job-co')
  }
  const cancel = () => {
    setRenaming(false)
    focusSoon('job-rename')
  }
  const keep = async () => {
    if (!role.trim()) return cancel()
    if (company.trim() === job.company && role.trim() === job.role) return cancel()
    setSaving(true)
    const problem = await onRename(company, role)
    setSaving(false)
    if (problem) {
      setError(problem)
      return
    }
    setRenaming(false)
    focusSoon('job-rename')
  }

  return (
    <section
      aria-labelledby="req-h"
      className="box-border flex max-h-[calc(100vh-140px)] min-w-0 flex-[1_1_270px] flex-col gap-2 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-white px-3.5 py-3"
    >
      <div className="flex flex-col gap-px">
        <h2 id="req-h" className="m-0 text-[14px] font-semibold">
          What the job asks for
        </h2>
        {!renaming ? (
          <span className="flex items-center gap-1 text-[12px] text-[var(--muted)]">
            <span>{job.label}</span>
            <button
              id="job-rename"
              type="button"
              onClick={start}
              aria-label="Rename this job"
              className="flex h-6 w-6 items-center justify-center rounded border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)] hover:text-[var(--text)]"
            >
              <Icon name="rename" size={12} />
            </button>
          </span>
        ) : (
          <>
            <div
              className="mt-1 flex flex-wrap items-center gap-1.5"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void keep()
                }
                if (e.key === 'Escape') cancel()
              }}
            >
              <label htmlFor="job-co" className="sr-only">
                Company
              </label>
              <input id="job-co" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="h-7 min-w-0 flex-[1_1_80px] rounded-md border border-[var(--border-strong)] bg-white px-2 text-[12.5px]" />
              <label htmlFor="job-role" className="sr-only">
                Role
              </label>
              <input id="job-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="h-7 min-w-0 flex-[2_1_120px] rounded-md border border-[var(--border-strong)] bg-white px-2 text-[12.5px]" />
              <button type="button" className="btn-s h-7 px-2.5 text-[12px]" onClick={() => void keep()} disabled={saving}>
                {saving ? 'Saving…' : 'Done'}
              </button>
            </div>
            <span className={`text-[11.5px] ${error ? 'text-[var(--amber)]' : 'text-[var(--muted)]'}`} role={error ? 'alert' : undefined}>
              {error ?? 'Versions made for this job take the new name.'}
            </span>
          </>
        )}
      </div>
      {requirements ? (
        <>
          <div className="flex flex-wrap gap-1">
            <span className="rounded-full bg-[var(--indigo-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--indigo-hover)]">{count('covered')} covered</span>
            <span className="rounded-full bg-[var(--amber-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)]">{count('partial')} partial</span>
            <span className="rounded-full bg-[#f1f2f4] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-2)]">{count('missing')} missing</span>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {requirements.map((r, i) => {
              const t = TONE[r.status]
              return (
                <li key={`${i}-${r.text}`} className="flex items-start gap-2 border-t border-[#eef0f3] py-[7px]">
                  <span className={`mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] ${t.icon}`}>
                    <Icon name={t.mark} size={12} />
                  </span>
                  <div className="flex min-w-0 flex-auto flex-col gap-px">
                    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                      <span className="text-[13px] font-medium">{r.text}</span>
                      <span className={`font-mono text-[9.5px] font-semibold tracking-[0.04em] ${t.text}`}>{t.word}</span>
                    </div>
                    <span className="text-[11.5px] leading-[1.35] text-[var(--muted)]">{r.evidence}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="m-0 border-t border-[#eef0f3] pt-2 text-[12.5px] leading-[1.45] text-[var(--muted)]">
          Add the posting’s link and press Analyze. The AI lists what the job asks for and which of your blocks show it.
        </p>
      )}
    </section>
  )
}

'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { C, btnS, cls, iconB, searchInput } from '@/components/ui/styles'
import { renameJob } from '@/features/analysis/actions'
import type { LibBlock } from '@/features/blocks/types'
import { compositionFromSaved } from '@/features/cv/composition'
import { CvPreview, NoCv } from '@/features/cv/components/cv-preview'
import { printCv } from '@/features/cv/print'
import type { ProfileData } from '@/features/profile/types'
import { LINK_KIND_LABELS, jobMatches, linkText } from '../links'
import { renameNote, renameProblem } from '../rename'
import type { BehavioralForJobs, JobData } from '../types'
import { BehavioralPanel } from './behavioral-panel'

type Props = { jobs: JobData[]; library: LibBlock[]; profile: ProfileData; behavioral: BehavioralForJobs; initialJobId: string | null }

const linkStyle = { fontWeight: 500 } as const

/** Read only: every job, its links and the exact CV saved for it. Editing happens in Compose CV (H6, H8). */
export function JobsView({ jobs, library, profile, behavioral, initialJobId }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(initialJobId && jobs.some((j) => j.id === initialJobId) ? initialJobId : (jobs[0]?.id ?? null))
  const [showBeh, setShowBeh] = useState(false)
  const matches = jobs.filter((j) => jobMatches(j, query))
  const sel = jobs.find((j) => j.id === selectedId) ?? null
  const printed = sel?.cv ? printCv(compositionFromSaved(sel.cv, library), library, profile) : null
  const pageCount = printed?.layout.pages.length ?? 0

  // Renaming in place (decision log): Company · Role, Enter saves, Esc cancels. Versions named after the
  // job take the new name too (renameJob), and a line says so.
  const [renaming, setRenaming] = useState<{ company: string; role: string } | null>(null)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [note, setNote] = useState('')
  const pen = useRef<HTMLButtonElement>(null)
  // Focus goes back to the pencil once it is on screen again (after Esc or a save).
  const restorePen = useRef(false)
  const focusPen = () => {
    restorePen.current = true
  }
  useEffect(() => {
    if (renaming || !restorePen.current) return
    restorePen.current = false
    pen.current?.focus()
  }, [renaming])

  const startRename = () => {
    if (!sel) return
    setRenaming({ company: sel.company, role: sel.role })
    setRenameError(null)
    setNote('')
  }
  const cancelRename = () => {
    setRenaming(null)
    setRenameError(null)
    focusPen()
  }
  const saveRename = async () => {
    if (!sel || !renaming || savingName) return
    const problem = renameProblem(renaming)
    if (problem) return setRenameError(problem)
    if (renaming.company.trim() === sel.company && renaming.role.trim() === sel.role) return cancelRename()
    setSavingName(true)
    const before = sel.label
    try {
      const res = await renameJob({ jobId: sel.id, company: renaming.company, role: renaming.role })
      if (!res.ok) return setRenameError(res.error)
      setNote(renameNote(before, res.data.label, res.data.renamedVersions))
      setRenaming(null)
      setRenameError(null)
      focusPen()
    } catch {
      setRenameError('Couldn’t reach the app to rename the job. Check that it is running, then press Enter again.')
    } finally {
      setSavingName(false)
    }
  }
  const onRenameKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'Enter') {
      ev.preventDefault()
      void saveRename()
    } else if (ev.key === 'Escape') {
      ev.preventDefault()
      cancelRename()
    }
  }
  const nameField = { flex: '1 1 0', minWidth: 0, height: 30, boxSizing: 'border-box', border: `1px solid ${C.borderStrong}`, borderRadius: 7, padding: '0 8px', fontSize: 12.5, fontWeight: 500, background: '#FFFFFF', color: C.text } as const

  const select = (id: string) => {
    if (savingName) return // the rename in flight belongs to this job; its note must show here
    if (id !== selectedId) {
      setRenaming(null)
      setRenameError(null)
      setNote('')
    }
    setSelectedId(id)
    window.history.replaceState(null, '', `?job=${encodeURIComponent(id)}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 12px' }}>
        <p className="eyebrow">JOBS</p>
        <h1 className="page-title">Every job and the CV for it</h1>
      </header>

      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
        <section aria-labelledby="jobs-h" style={{ flex: '0 1 340px', minWidth: 280, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto', boxSizing: 'border-box', background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="jobs-h" style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Jobs</h2>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: 9, color: C.faint, display: 'flex' }}>
              <Icon name="search" />
            </span>
            <input type="search" aria-label="Search jobs" className={cls.field} value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={`Search ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} by company, role or link`} style={searchInput} />
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {matches.map((j) => {
              const on = j.id === sel?.id
              return (
                <li key={j.id} style={{ position: 'relative', borderRadius: 8, background: on ? C.indigoSoft : 'transparent' }}>
                  {on && renaming ? (
                    <div onKeyDown={onRenameKey} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px 2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input aria-label="Company" placeholder="Company" className={cls.field} value={renaming.company} readOnly={savingName} onChange={(ev) => setRenaming({ ...renaming, company: ev.target.value })} style={nameField} />
                        <span aria-hidden="true" style={{ color: C.muted }}>·</span>
                        {/* The role is what changes most often; it gets the focus. */}
                        <input aria-label="Role" placeholder="Role" autoFocus className={cls.field} value={renaming.role} readOnly={savingName} onChange={(ev) => setRenaming({ ...renaming, role: ev.target.value })} style={nameField} />
                      </div>
                      <p role={renameError ? 'alert' : undefined} style={{ margin: 0, fontSize: 11, lineHeight: 1.4, color: renameError ? C.danger : C.muted }}>
                        {renameError ?? (savingName ? 'Renaming…' : `Enter saves · Esc cancels. Versions named “${j.label}” get the new name too.`)}
                      </p>
                    </div>
                  ) : (
                  <button type="button" className={cls.jobO} onClick={() => select(j.id)} aria-current={on ? 'true' : undefined} aria-expanded={on} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, padding: on ? '8px 44px 8px 10px' : '8px 10px', border: 0, borderRadius: 8, background: 'transparent', textAlign: 'left' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: C.text }}>{j.label}</span>
                      {!on && <span style={{ flex: '0 0 auto', fontSize: 11, color: j.cv ? C.muted : C.amber }}>{j.cv ? j.cv.savedLabel : 'No CV yet'}</span>}
                    </span>
                    {!on && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: C.muted }}>{j.links.length ? j.links.map((l) => linkText(l.url)).join(' · ') : 'No links yet'}</span>}
                    {on && (
                      <span style={{ fontSize: 12, color: C.muted }}>
                        {j.cv ? `CV · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${j.cv.savedLabel}` : 'No CV yet'}
                      </span>
                    )}
                  </button>
                  )}
                  {on && !renaming && (
                    <button ref={pen} type="button" className={cls.iconB} onClick={startRename} aria-label={`Rename ${j.label}`} title="Rename this job" style={iconB(26, { position: 'absolute', top: 6, right: 8, color: C.indigoInk, boxShadow: `inset 0 0 0 1px ${C.indigoLine}`, borderRadius: 6 })}>
                      <Icon name="edit" size={14} />
                    </button>
                  )}
                  {on && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 10px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5 }}>
                        {j.links.map((l, i) => (
                          <span key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ flex: '0 0 92px', color: C.muted }}>{LINK_KIND_LABELS[l.kind]}</span>
                            <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`${LINK_KIND_LABELS[l.kind]}: ${linkText(l.url)} (opens in a new tab)`} style={linkStyle}>
                              {linkText(l.url)} ↗
                            </a>
                          </span>
                        ))}
                        {j.links.length === 0 && <span style={{ color: C.muted }}>No links yet</span>}
                      </div>
                      {note && (
                        <p role="status" style={{ margin: 0, fontSize: 11.5, color: C.okInk }}>
                          ✓ {note}
                        </p>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {j.cv && (
                          <button type="button" disabled title="PDF export isn’t built yet" style={btnS(30, { padding: '0 12px' })}>
                            <Icon name="download" size={13} />
                            PDF
                          </button>
                        )}
                        <button type="button" className={cls.btnS} onClick={() => setShowBeh((s) => !s)} aria-pressed={showBeh} style={btnS(30, { padding: '0 12px', ...(showBeh ? { borderColor: C.indigo, color: C.indigoInk, background: C.indigoSoft } : {}) })}>
                          <Icon name="message" size={13} />
                          {showBeh ? 'Hide behavioral' : 'See behavioral'}
                        </button>
                        <Link href={`/compose?job=${encodeURIComponent(j.id)}`} className={cls.btnS} style={btnS(30, { padding: '0 12px' })}>
                          Open in Compose CV
                        </Link>
                        {/* Opens this job's Job analysis where it was left (the analysis is saved with the job). */}
                        <Link href={`/analyze?job=${encodeURIComponent(j.id)}`} className={cls.btnS} style={btnS(30, { padding: '0 12px' })}>
                          <Icon name="sparkle" size={13} />
                          {j.analyzedAt ? 'Analyze again' : 'Analyze'}
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {matches.length === 0 && <p style={{ margin: 0, padding: '4px 2px', fontSize: 12.5, color: C.muted }}>{jobs.length ? `No job matches “${query}”.` : 'No jobs yet. Create one in Compose CV with “+ New job”.'}</p>}
        </section>

        <section
          aria-label={sel ? `CV for ${sel.label}` : 'CV'}
          style={{ ...(showBeh ? { flex: '0 0 auto', width: 432 } : { flex: '1 1 400px' }), minWidth: 0, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto', boxSizing: 'border-box', padding: '12px 12px 16px', borderRadius: 10, background: C.previewBg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
        >
          {printed && sel ? (
            <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, ...(showBeh ? { width: 680, zoom: 0.6 } : { width: '100%' }) }}>
              <CvPreview layout={printed.layout} profile={profile} labels={printed.layout.pages.map((_, i) => ({ text: `Page ${i + 1} of ${pageCount}`, beyond: false }))} />
            </div>
          ) : (
            <NoCv text={sel ? 'No CV saved for this job yet.' : 'Pick a job to see its CV.'} />
          )}
        </section>

        {showBeh && sel && <BehavioralPanel job={sel} behavioral={behavioral} onClose={() => setShowBeh(false)} />}
      </div>
    </div>
  )
}

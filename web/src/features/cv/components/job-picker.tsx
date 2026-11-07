'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import type { LinkKind } from '@prisma/client'
import { focusFirst, useOutsideClose } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icons'
import { C, btnP, btnS, cls, iconB, popover, searchInput } from '@/components/ui/styles'
import { LINK_KINDS, LINK_KIND_LABELS, findJobByLabel, guessLinkKind, isValidUrl, jobLabel, jobMatches, linkText, nextLinkKind, normalizeUrl, splitJobQuery } from '@/features/jobs/links'
import type { JobData } from '@/features/jobs/types'
import type { ActionResult } from '../action-result'

const LIMIT = 8

type DraftLink = { id: number; kind: LinkKind; url: string; kindSet: boolean }
type NewJob = { company: string; role: string; links: DraftLink[] }

type Props = {
  jobs: JobData[]
  current: JobData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A job you picked while the CV has unsaved changes. */
  pendingJob: JobData | null
  onPick: (jobId: string) => void
  onCancelPending: () => void
  onSwitchNoSave: () => void
  onSaveAndSwitch: () => void
  onCreate: (input: { company: string; role: string; links: { kind: LinkKind; url: string }[] }) => Promise<ActionResult<JobData>>
}

const field = { height: 30, boxSizing: 'border-box' as const, padding: '0 8px', border: `1px solid ${C.borderStrong}`, borderRadius: 6, background: '#FFFFFF', fontSize: 12.5 }

/** "For job": a searchable picker that shows each job's links and CV status, with "+ New job" (decision log). */
export function JobPicker({ jobs, current, open, onOpenChange, pendingJob, onPick, onCancelPending, onSwitchNoSave, onSaveAndSwitch, onCreate }: Props) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<NewJob | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  useOutsideClose(open, [box], () => onOpenChange(false))

  const q = query.trim()
  const matches = jobs.filter((j) => jobMatches(j, q))
  const label = draft ? jobLabel(draft.company, draft.role) : ''
  const dup = draft && draft.role.trim() ? findJobByLabel(jobs, label) : null
  const roleErr = !!draft && tried && !draft.role.trim()

  const nextId = () => {
    seq.current += 1
    return seq.current
  }

  const close = () => {
    onOpenChange(false)
    focusFirst(['job-btn'])
  }

  function toggle() {
    const next = !open
    setQuery('')
    onOpenChange(next)
    if (next) focusFirst([draft ? 'nj-company' : 'job-q'])
  }

  function startNewJob() {
    const parts = splitJobQuery(q)
    setDraft({ company: parts.company, role: parts.role, links: [{ id: nextId(), kind: 'POSTING', url: '', kindSet: false }] })
    setTried(false)
    setError(null)
    focusFirst([q ? 'nj-role' : 'nj-company'])
  }

  const setLink = (id: number, patch: Partial<DraftLink>) => draft && setDraft({ ...draft, links: draft.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) })

  function addLink() {
    if (!draft) return
    const id = nextId()
    setDraft({ ...draft, links: [...draft.links, { id, kind: nextLinkKind(draft.links.map((l) => l.kind)), url: '', kindSet: false }] })
    focusFirst([`nl-url-${id}`])
  }

  function removeLink(id: number) {
    if (!draft) return
    if (draft.links.length === 1) setLink(id, { url: '' })
    else setDraft({ ...draft, links: draft.links.filter((l) => l.id !== id) })
  }

  async function create() {
    if (!draft || busy) return
    const links = draft.links.filter((l) => l.url.trim()).map((l) => ({ kind: l.kind, url: normalizeUrl(l.url) }))
    if (!draft.role.trim() || links.some((l) => !isValidUrl(l.url)) || dup) {
      setTried(true)
      return
    }
    setBusy(true)
    const res = await onCreate({ company: draft.company, role: draft.role, links })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setDraft(null)
    setTried(false)
    onPick(res.data.id)
  }

  const heading = pendingJob ? 'Unsaved changes' : draft ? 'New job' : 'Choose a job'

  return (
    <div ref={box} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span id="job-l" style={{ fontSize: 11.5, fontWeight: 500, color: C.muted }}>For job</span>
      <button type="button" id="job-btn" className={cls.btnS} onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-labelledby="job-l job-cur" style={btnS(32, { width: 200, padding: '0 8px 0 10px', textAlign: 'left' })}>
        <span id="job-cur" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label ?? 'No job yet'}</span>
        <Icon name="chevronDown" style={{ color: C.muted }} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={heading}
          onKeyDown={(ev) => {
            if (ev.key !== 'Escape') return
            onCancelPending()
            close()
          }}
          style={{ ...popover, position: 'absolute', zIndex: 40, top: 'calc(100% + 6px)', left: 0, width: 384, maxWidth: 'calc(100vw - 32px)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {pendingJob ? (
            <>
              <p style={{ margin: 0, padding: '2px 2px 0', fontSize: 13, lineHeight: 1.45 }}>
                Your changes to the CV for <strong>{current?.label}</strong> aren’t saved.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                <button type="button" className={cls.btnS} onClick={onCancelPending} style={btnS(30)}>Cancel</button>
                <button type="button" className={cls.btnS} onClick={onSwitchNoSave} style={btnS(30)}>Switch without saving</button>
                <button type="button" className={cls.btnP} onClick={onSaveAndSwitch} style={btnP(30)}>Save and switch</button>
              </div>
            </>
          ) : draft ? (
            <>
              <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>New job</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label htmlFor="nj-company" style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>Company</label>
                  <input id="nj-company" className={cls.field} value={draft.company} onChange={(ev) => setDraft({ ...draft, company: ev.target.value })} placeholder="e.g. Nubank" style={field} />
                </div>
                <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <label htmlFor="nj-role" style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>Role</label>
                  <input id="nj-role" className={cls.field} value={draft.role} onChange={(ev) => setDraft({ ...draft, role: ev.target.value })} placeholder="e.g. Software Engineer" aria-invalid={roleErr} aria-describedby={roleErr ? 'nj-role-err' : undefined} style={{ ...field, borderColor: roleErr ? C.danger : C.borderStrong }} />
                </div>
              </div>
              {roleErr && <span id="nj-role-err" role="alert" style={{ fontSize: 11.5, color: C.danger }}>Add the role. It names the job everywhere in the app.</span>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>Links</span>
                <span style={{ fontSize: 11.5, lineHeight: 1.4, color: C.muted }}>The posting, where you applied, the company site. The AI reads them.</span>
                {draft.links.map((l, i) => {
                  const bad = tried && !!l.url.trim() && !isValidUrl(normalizeUrl(l.url))
                  return (
                    <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <label htmlFor={`nl-kind-${l.id}`} className="sr-only">Type of link {i + 1}</label>
                        <select id={`nl-kind-${l.id}`} value={l.kind} onChange={(ev) => setLink(l.id, { kind: ev.target.value as LinkKind, kindSet: true })} style={{ ...field, flex: '0 0 116px', padding: '0 4px', fontSize: 12 }}>
                          {LINK_KINDS.map((k) => (
                            <option key={k} value={k}>{LINK_KIND_LABELS[k]}</option>
                          ))}
                        </select>
                        <label htmlFor={`nl-url-${l.id}`} className="sr-only">Link {i + 1}</label>
                        <input
                          id={`nl-url-${l.id}`}
                          type="url"
                          className={cls.field}
                          value={l.url}
                          onChange={(ev) => {
                            const url = ev.target.value
                            const guess = l.kindSet ? null : guessLinkKind(url)
                            setLink(l.id, guess ? { url, kind: guess } : { url })
                          }}
                          placeholder="https://"
                          aria-invalid={bad}
                          style={{ ...field, flex: '1 1 auto', minWidth: 0, borderColor: bad ? C.danger : C.borderStrong }}
                        />
                        <button type="button" className={cls.iconB} onClick={() => removeLink(l.id)} aria-label={`Remove link ${i + 1}`} style={iconB(28)}>
                          <Icon name="close" />
                        </button>
                      </div>
                      {bad && <span role="alert" style={{ paddingLeft: 122, fontSize: 11.5, color: C.danger }}>Not a full link. Copy it from the browser’s address bar.</span>}
                    </div>
                  )
                })}
                <button type="button" className={cls.addB} onClick={addLink} style={{ alignSelf: 'flex-start', height: 26, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 6px', border: 0, borderRadius: 4, background: 'transparent', fontSize: 12, fontWeight: 500, color: C.indigo }}>
                  <Icon name="plus" size={13} />
                  Add link
                </button>
              </div>
              {dup && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: C.amberSoft, border: `1px solid ${C.amberLine}` }}>
                  <span style={{ flex: '1 1 auto', fontSize: 12, color: C.amberInk }}>You already have “{dup.label}”.</span>
                  <button
                    type="button"
                    className={cls.btnS}
                    onClick={() => {
                      setDraft(null)
                      onPick(dup.id)
                    }}
                    style={btnS(26, { padding: '0 8px', border: `1px solid ${C.amberButton}`, color: C.amber, fontSize: 12, fontWeight: 600 })}
                  >
                    Open it
                  </button>
                </div>
              )}
              {error && <span role="alert" style={{ fontSize: 12, color: C.danger }}>{error}</span>}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: `1px solid ${C.hairline}` }}>
                <Link href="/analyze" style={{ flex: '1 1 auto', fontSize: 12, fontWeight: 500 }}>Analyze a posting instead</Link>
                <button
                  type="button"
                  className={cls.btnS}
                  onClick={() => {
                    setDraft(null)
                    focusFirst(['job-q'])
                  }}
                  style={btnS(30)}
                >
                  Back
                </button>
                <button type="button" className={cls.btnP} onClick={() => void create()} disabled={busy} style={btnP(30)}>
                  {busy ? 'Creating…' : 'Create job'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: 9, color: C.faint, display: 'flex' }}>
                  <Icon name="search" />
                </span>
                <input id="job-q" type="search" aria-label="Search jobs" className={cls.field} value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={`Search ${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`} style={searchInput} />
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {matches.slice(0, LIMIT).map((j) => {
                  const on = j.id === current?.id
                  return (
                    <li key={j.id} style={{ display: 'flex', flexDirection: 'column', borderRadius: 8, background: on ? C.indigoSoft : 'transparent' }}>
                      <button type="button" className={cls.jobO} onClick={() => onPick(j.id)} aria-pressed={on} style={{ width: '100%', minHeight: 40, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', border: 0, borderRadius: 8, background: 'transparent', textAlign: 'left' }}>
                        <span style={{ flex: '0 0 14px', height: 18, display: 'flex', alignItems: 'center', color: C.indigo }}>{on && <Icon name="check" />}</span>
                        <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 600, color: C.text }}>{j.label}</span>
                            <span style={{ flex: '0 0 auto', fontSize: 11, color: j.cv ? C.muted : C.amber }}>{j.cv ? j.cv.savedLabel : 'No CV yet'}</span>
                          </span>
                          {!on && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: C.muted }}>{j.links.length ? j.links.map((l) => linkText(l.url)).join(' · ') : 'No links yet'}</span>}
                        </span>
                      </button>
                      {on && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', padding: '0 8px 8px 30px', fontSize: 12 }}>
                          {j.links.map((l, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ color: C.muted }}>{LINK_KIND_LABELS[l.kind]}</span>
                              <a href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`${LINK_KIND_LABELS[l.kind]}: ${linkText(l.url)} (opens in a new tab)`} style={{ fontWeight: 500 }}>
                                {linkText(l.url)} ↗
                              </a>
                            </span>
                          ))}
                          {j.links.length === 0 && <span style={{ color: C.muted }}>No links yet</span>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {matches.length === 0 && <p style={{ margin: 0, padding: '2px 8px', fontSize: 12.5, color: C.muted }}>{jobs.length ? `No job matches “${q}”.` : 'No jobs yet.'}</p>}
              {matches.length > LIMIT && <p style={{ margin: 0, padding: '0 8px', fontSize: 11.5, color: C.muted }}>Showing {LIMIT} of {matches.length}. Search to find the others.</p>}
              <div style={{ paddingTop: 6, borderTop: `1px solid ${C.hairline}` }}>
                <button type="button" className={cls.jobO} onClick={startNewJob} style={{ width: '100%', minHeight: 34, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 12.5, fontWeight: 600, color: C.indigo, textAlign: 'left' }}>
                  <Icon name="plus" />
                  {q && !findJobByLabel(jobs, q) ? `New job “${q}”` : 'New job'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

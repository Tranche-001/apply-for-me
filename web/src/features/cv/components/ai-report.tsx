'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { C, MONO, btnS, cls, iconB } from '@/components/ui/styles'
import type { AiReportLine } from '@/features/ai/types'

export type AskState = { id: string; text: string; answer: string; status: 'open' | 'sending' | 'sent' | 'skipped'; error: string | null }

export type AiRun = {
  jobId: string
  jobLabel: string
  /** What went wrong, in words (H9); the CV is unchanged. */
  error: string | null
  report: AiReportLine[]
  asks: AskState[]
}

const TONE: Record<AiReportLine['tag'], CSSProperties> = {
  NEW: { background: C.amberSoft, color: C.amber },
  REUSED: { background: C.indigoSoft, color: C.indigoInk },
  ORDER: { background: '#E6F3F1', color: '#115E59' },
  ADDED: { background: '#E7F5EC', color: C.okInk },
  'LEFT OUT': { background: '#F1F2F4', color: C.text2 },
  NOTE: { background: '#F1F2F4', color: C.text2 },
}

type Props = {
  run: AiRun
  open: boolean
  canUndo: boolean
  dirty: boolean
  busy: boolean
  onToggle: () => void
  onUndo: () => void
  onDismiss: () => void
  onRetry: () => void
  onAsk: (id: string, patch: Partial<AskState>) => void
  onSendAsk: (ask: AskState) => void
}

const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`

/** "What the AI did": every change it made, its questions, and Undo (P2, H1, H3). */
export function AiReport({ run, open, canUndo, dirty, busy, onToggle, onUndo, onDismiss, onRetry, onAsk, onSendAsk }: Props) {
  const shown = run.asks.filter((a) => a.status !== 'skipped')
  const waiting = shown.filter((a) => a.status === 'open').length
  const skipped = run.asks.length - shown.length
  const failed = !!run.error
  const title = failed ? 'The AI couldn’t write this CV' : `AI draft for ${run.jobLabel}`
  const summary = failed
    ? 'Your CV is unchanged.'
    : `${n(run.report.length, 'change')}${waiting ? ` · ${n(waiting, 'question')} for you` : ''}${dirty ? ' · not saved yet' : ' · saved'}`
  return (
    <section aria-label="What the AI did" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#F7F7FE', border: '1px solid #DDE0FC' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px' }}>
        <Icon name="sparkle" style={{ color: C.indigo }} />
        <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{title}</span>
          <span style={{ fontSize: 11.5, color: C.muted }}>{summary}</span>
        </span>
        {!failed && (
          <button type="button" onClick={onToggle} aria-expanded={open} style={{ height: 26, padding: '0 6px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 12, fontWeight: 600, color: C.indigo }}>
            {open ? 'Hide' : 'What it did'}
          </button>
        )}
        {failed && (
          <button type="button" className={cls.btnS} onClick={onRetry} disabled={busy} style={btnS(26, { padding: '0 8px', fontSize: 12 })}>
            {busy ? 'Writing…' : 'Retry'}
          </button>
        )}
        {canUndo && (
          <button type="button" className={cls.btnS} onClick={onUndo} style={btnS(26, { padding: '0 8px', fontSize: 12 })}>
            Undo
          </button>
        )}
        <button type="button" className={cls.iconB} onClick={onDismiss} aria-label="Hide the AI report" style={iconB(26)}>
          <Icon name="close" />
        </button>
      </div>
      {failed && <p role="alert" style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: C.amberInk }}>{run.error}</p>}
      {!failed && open && (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {run.report.map((r, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, lineHeight: 1.4 }}>
                <span style={{ flex: '0 0 auto', marginTop: 1, padding: '1px 5px', borderRadius: 3, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em', ...TONE[r.tag] }}>{r.tag}</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
          {shown.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: C.amberInk }}>It would help to have</span>
              {shown.map((a) => (
                <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 8, background: C.amberSoft, border: `1px solid ${C.amberLine}` }}>
                  <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: C.amberInk }}>{a.text}</p>
                  {a.status === 'sent' ? (
                    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, color: C.okInk }}>Saved to your notes in Experiences. The AI will draft a bullet from it for you to review.</p>
                  ) : (
                    <>
                      <label htmlFor={`ask-${a.id}`} className="sr-only">Your answer</label>
                      <textarea
                        id={`ask-${a.id}`}
                        rows={2}
                        className={cls.field}
                        value={a.answer}
                        onChange={(ev) => onAsk(a.id, { answer: ev.target.value })}
                        placeholder="Your answer, in your words. The AI turns it into a bullet."
                        style={{ boxSizing: 'border-box', width: '100%', resize: 'none', fieldSizing: 'content', minHeight: 44, padding: '5px 8px', border: `1px solid ${C.amberButton}`, borderRadius: 6, background: '#FFFFFF', fontSize: 12.5, lineHeight: 1.4 } as CSSProperties}
                      />
                      {a.error && <span role="alert" style={{ fontSize: 11.5, color: C.danger }}>{a.error}</span>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className={cls.btnS} onClick={() => onAsk(a.id, { status: 'skipped' })} style={btnS(28, { padding: '0 8px', border: `1px solid ${C.amberButton}`, fontSize: 11.5, color: C.amberInk })}>
                          I don’t have this
                        </button>
                        <button type="button" onClick={() => onSendAsk(a)} disabled={!a.answer.trim() || a.status === 'sending'} style={{ height: 28, padding: '0 8px', borderRadius: 6, border: `1px solid ${C.amber}`, background: C.amber, fontSize: 11.5, fontWeight: 600, color: '#FFFFFF' }}>
                          {a.status === 'sending' ? 'Saving…' : 'Add to CV'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {skipped > 0 && <span style={{ fontSize: 11.5, color: C.muted }}>{n(skipped, 'question')} skipped. The AI won’t ask again for this job.</span>}
          {run.report.some((r) => r.tag === 'NOTE') && (
            <Link href="/analyze" style={{ fontSize: 12, fontWeight: 600 }}>
              Analyze this job’s posting
            </Link>
          )}
        </>
      )}
    </section>
  )
}

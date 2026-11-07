'use client'

// "What the AI made": every new version and new block with Keep / Edit / Discard, what it reused as is,
// and Save, which stores only what you kept, linked to this job (decision log, P2, P3).
import Link from 'next/link'
import { useState } from 'react'
import type { AiAsk, AiReportLine, ReusedVersion } from '@/features/ai/types'
import { DraftFields, DraftPreview } from '@/features/ai/ui/draft-fields'
import { Icon } from '@/features/ai/ui/icon'
import { madeSummary, toSave, type MadeDraft } from '../types'

type Props = {
  jobId: string
  made: MadeDraft[] | null
  asks: AiAsk[]
  reused: ReusedVersion[]
  notes: AiReportLine[]
  onChange: (key: string, patch: Partial<MadeDraft>) => void
  onDiscard: (key: string) => void
  onUndoDiscard: (() => void) | null
  onRefine: (instruction: string) => void
  onSave: () => void
  savedText: string | null
  saveError: string | null
  busy: boolean
}

export function MadePanel({ jobId, made, asks, reused, notes, onChange, onDiscard, onUndoDiscard, onRefine, onSave, savedText, saveError, busy }: Props) {
  const [refine, setRefine] = useState('')
  const count = made ? toSave(made).length : 0
  const askNumber = (id: string) => asks.findIndex((a) => a.id === id) + 1

  return (
    <section
      aria-labelledby="m-h"
      className="box-border flex max-h-[calc(100vh-140px)] min-w-0 flex-[1.7_1_420px] flex-col gap-2 overflow-y-auto rounded-[10px] border border-[var(--indigo-line)] bg-white px-3.5 py-3"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h2 id="m-h" className="m-0 text-[14px] font-semibold">
          What the AI made
        </h2>
        <span className="text-[12px] text-[var(--muted)]">{made ? madeSummary(made) : 'Nothing yet'}</span>
      </div>

      {made === null && (
        <p className="m-0 text-[12.5px] leading-[1.45] text-[var(--muted)]">
          New versions of your blocks and new blocks appear here, each with Keep, Edit and Discard. The AI reuses a version that already fits
          before writing a new one.
        </p>
      )}

      {onUndoDiscard && (
        <p role="status" className="m-0 flex items-center gap-2 text-[12px] text-[var(--muted)]">
          Draft discarded.
          <button type="button" className="btn-s h-6 px-2 text-[11.5px]" onClick={onUndoDiscard}>
            Undo
          </button>
        </p>
      )}

      {made && made.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {made.map((m) => {
            const waiting = Boolean(m.waitingOn)
            const n = m.waitingOn ? askNumber(m.waitingOn) : 0
            const box = waiting
              ? 'border border-dashed border-[#d9a35b] bg-[#fffcf6]'
              : m.keep
                ? 'border border-[var(--border)] bg-white'
                : 'border border-[var(--border)] bg-[#fafafb] opacity-60'
            return (
              <li key={m.key} className={`flex flex-col gap-[5px] rounded-lg px-2.5 py-[9px] ${box}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`rounded px-1.5 py-px font-mono text-[9.5px] font-semibold tracking-[0.04em] ${
                      m.blockId ? 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'
                    }`}
                  >
                    {m.blockId ? 'NEW VERSION' : 'NEW BLOCK'}
                  </span>
                  <span className="text-[12px] text-[var(--muted)]">
                    {waiting ? `waiting for your answer${n ? ` to Q${n}` : ''}` : m.blockId ? `of ${m.blockName}` : m.blockName}
                  </span>
                  <span className="flex-auto" />
                  {!waiting && (
                    <>
                      <label className="inline-flex cursor-pointer items-center gap-[5px] text-[12px] text-[var(--text-2)]">
                        <input type="checkbox" checked={m.keep} onChange={() => onChange(m.key, { keep: !m.keep })} className="m-0 h-3.5 w-3.5 accent-[var(--indigo)]" />
                        Keep
                      </label>
                      <button
                        type="button"
                        aria-label={`${m.editing ? 'Stop editing' : 'Edit'} ${m.title || m.blockName}`}
                        aria-pressed={m.editing}
                        onClick={() => onChange(m.key, { editing: !m.editing })}
                        className="flex h-[26px] w-[26px] items-center justify-center rounded-md border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)] hover:text-[var(--text)]"
                      >
                        <Icon name="pencil" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`Discard ${m.title || m.blockName}`}
                    onClick={() => onDiscard(m.key)}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)] hover:text-[var(--text)]"
                  >
                    <Icon name="x" />
                  </button>
                </div>
                {m.editing && !waiting ? (
                  <DraftFields idPrefix={`md-${m.key}`} title={m.title} bullets={m.bullets} onChange={(next) => onChange(m.key, next)} />
                ) : (
                  <DraftPreview title={m.title} bullets={m.bullets} />
                )}
                {m.note && <span className={`text-[11.5px] leading-[1.4] ${waiting ? 'text-[var(--amber)]' : 'text-[var(--muted)]'}`}>{m.note}</span>}
                {waiting && <span className="text-[11.5px] text-[var(--amber)]">Nothing is written until you answer. Then update the drafts.</span>}
              </li>
            )
          })}
        </ul>
      )}
      {made && made.length === 0 && <p className="m-0 text-[12.5px] text-[var(--muted)]">No new drafts: what you have already fits, or you discarded them.</p>}

      {reused.length > 0 && (
        <div className="flex flex-col gap-[3px] border-t border-[#eef0f3] pt-1.5">
          <span className="text-[11px] font-semibold text-[var(--text-2)]">Reused as they are</span>
          {reused.map((r) => (
            <span key={r.versionId} className="text-[12px] text-[var(--muted)]">
              <strong className="font-semibold text-[#22252c]">{r.blockName}</strong> · {r.versionName} · {r.why}
            </span>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div className="flex flex-col gap-[3px] border-t border-[#eef0f3] pt-1.5">
          <span className="text-[11px] font-semibold text-[var(--text-2)]">Notes from the AI</span>
          {notes.map((n, i) => (
            <span key={`${i}-${n.text}`} className="text-[12px] leading-[1.4] text-[var(--muted)]">
              {n.text}
            </span>
          ))}
        </div>
      )}

      <span className="flex-auto" />
      {(savedText || saveError) && (
        <p role={saveError ? 'alert' : 'status'} className={`m-0 text-[12.5px] ${saveError ? 'text-[var(--amber)]' : 'text-[var(--ok-ink)]'}`}>
          {saveError ?? savedText}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <form
          className="flex min-w-[220px] flex-auto gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (!refine.trim()) return
            onRefine(refine.trim())
            setRefine('')
          }}
        >
          <label htmlFor="refine" className="sr-only">
            Ask for changes to these drafts
          </label>
          <input
            id="refine"
            value={refine}
            onChange={(e) => setRefine(e.target.value)}
            disabled={!made?.length}
            placeholder="Ask for changes, e.g. shorter bullets, lead with Gemini"
            className="h-8 min-w-0 flex-auto rounded-md border border-[var(--border-strong)] px-2.5 text-[12.5px] placeholder:text-[#6b7180]"
          />
          <button type="submit" aria-label="Send change request" disabled={!refine.trim() || busy} className="btn-s h-8 w-8 flex-none justify-center p-0">
            <Icon name="send" />
          </button>
        </form>
        <Link href={`/compose?job=${encodeURIComponent(jobId)}`} className="btn-s flex-none">
          <Icon name="file" size={13} />
          Open its CV
        </Link>
        <button type="button" className="btn-p flex-none" onClick={onSave} disabled={!count || busy}>
          <Icon name="check" size={13} />
          {count ? `Save ${count} to library` : 'Nothing to save'}
        </button>
      </div>
    </section>
  )
}

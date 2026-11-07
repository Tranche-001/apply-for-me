'use client'

// "Theory and references by the Founder" (read only, "Use in my answers") and your own
// "Theory and references" with "Copy from the Founder" (adds, never replaces, can be undone).
import { useState } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { copyFounder, copyMessage, type QuestionItem } from '../types'

type Theory = { theory: string; references: string[] }

export function FounderSection({ question, useFounder, onToggle, error }: { question: QuestionItem; useFounder: boolean; onToggle: (next: boolean) => void; error: string | null }) {
  const has = Boolean(question.founderNotes.trim() || question.founderRefs.length)
  return (
    <section aria-labelledby="fth-h" className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 id="fth-h" className="m-0 text-[16px] font-semibold">
            Theory and references by the Founder
          </h2>
          <p className="m-0 text-[13px] text-[var(--muted)]">From Guilherme Motta Tranche, who built apply-for-me. Read only.</p>
        </div>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#f6f7f9] px-3 text-[13px] font-medium">
          <input
            type="checkbox"
            checked={has && useFounder}
            disabled={!has}
            onChange={(e) => onToggle(e.target.checked)}
            className="m-0 h-4 w-4 accent-[var(--indigo)]"
          />
          Use in my answers
        </label>
      </div>
      {has ? (
        <>
          {question.founderNotes.trim() && (
            <div lang="pt-BR" className="whitespace-pre-wrap rounded-lg bg-[#f6f7f9] px-3.5 py-3 text-[14px] leading-[1.6] text-[#22252c]">
              {question.founderNotes}
            </div>
          )}
          {question.founderRefs.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {question.founderRefs.map((r) => (
                <li key={r} lang="pt-BR" className="flex items-center gap-2.5 rounded-lg border border-[#eef0f3] px-3 py-2.5 text-[13px] text-[#22252c]">
                  <Icon name="book" size={16} className="text-[var(--muted)]" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={`m-0 text-[12.5px] ${useFounder ? 'text-[var(--ok-ink)]' : 'text-[var(--muted)]'}`}>
            {useFounder ? 'The AI reads these when it adapts your answers.' : 'Not used. The AI reads only your own notes.'}
          </p>
          {error && (
            <p role="alert" className="m-0 text-[12.5px] text-[var(--amber)]">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="m-0 rounded-lg border border-dashed border-[var(--border-strong)] px-3.5 py-3 text-[13px] italic text-[var(--muted)]">
          The Founder hasn’t written notes for this question yet.
        </p>
      )}
    </section>
  )
}

type MineProps = { question: QuestionItem; value: Theory; onChange: (next: Theory) => void }

export function MyTheorySection({ question, value, onChange }: MineProps) {
  const [copied, setCopied] = useState<{ before: Theory; message: string } | null>(null)
  const [newRef, setNewRef] = useState('')
  const [adding, setAdding] = useState(false)
  const founderEmpty = !question.founderNotes.trim() && !question.founderRefs.length

  const copy = () => {
    const result = copyFounder(value, { notes: question.founderNotes, refs: question.founderRefs })
    setCopied({ before: value, message: copyMessage(result) })
    onChange({ theory: result.theory, references: result.references })
  }

  const addRef = () => {
    const text = newRef.trim()
    if (!text) return
    if (!value.references.some((r) => r.toLowerCase() === text.toLowerCase())) onChange({ ...value, references: [...value.references, text] })
    setNewRef('')
    setAdding(false)
  }

  return (
    <section aria-labelledby="th-h" className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <h2 id="th-h" className="m-0 text-[16px] font-semibold">
            Theory and references
          </h2>
          <p className="m-0 text-[13px] text-[var(--muted)]">Yours to fill. The AI reads these notes when it adapts your answers.</p>
        </div>
        <button type="button" className="btn-s min-h-9 rounded-lg px-3 text-[13px]" onClick={copy} disabled={founderEmpty}>
          <Icon name="copy" />
          Copy from the Founder
        </button>
      </div>
      {copied && (
        <div role="status" className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg bg-[var(--indigo-soft)] px-3 py-2 text-[13px] text-[var(--indigo-hover)]">
          <span className="flex-auto">{copied.message}</span>
          <button
            type="button"
            onClick={() => {
              onChange(copied.before)
              setCopied(null)
            }}
            className="h-7 rounded-md border-0 bg-white px-2.5 text-[12.5px] font-semibold text-[var(--indigo-hover)]"
          >
            Undo
          </button>
        </div>
      )}
      <label htmlFor="theory" className="sr-only">
        Notes on how to answer
      </label>
      <textarea
        id="theory"
        rows={4}
        value={value.theory}
        onChange={(e) => onChange({ ...value, theory: e.target.value })}
        placeholder="[How to structure this answer, what to avoid, examples you liked]"
        className="w-full resize-y rounded-lg border border-[var(--border-strong)] px-3.5 py-3 text-[14px] leading-[1.6] placeholder:text-[#6b7180] focus:border-[var(--indigo)] focus:outline-none"
      />
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {value.references.map((r) => (
          <li key={r} lang="pt-BR" className="flex items-center gap-2.5 rounded-lg border border-[#eef0f3] py-1 pl-3 pr-1 text-[13px] text-[#22252c]">
            <Icon name="link" size={16} />
            <span className="flex-auto">{r}</span>
            <button
              type="button"
              aria-label={`Remove reference ${r}`}
              onClick={() => onChange({ ...value, references: value.references.filter((x) => x !== r) })}
              className="flex h-8 w-8 items-center justify-center rounded-md border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)]"
            >
              <Icon name="x" size={13} />
            </button>
          </li>
        ))}
        {!value.references.length && !adding && (
          <li className="flex items-center gap-2.5 rounded-lg border border-[#eef0f3] px-3 py-2.5 text-[13px] text-[var(--muted)]">
            <Icon name="link" size={16} />
            [Book, article or video] · [link]
          </li>
        )}
      </ul>
      {adding ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addRef()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAdding(false)
              setNewRef('')
            }
          }}
        >
          <label htmlFor="new-ref" className="sr-only">
            New reference
          </label>
          <input
            id="new-ref"
            autoFocus
            value={newRef}
            onChange={(e) => setNewRef(e.target.value)}
            placeholder="Book, article or video · link"
            className="min-h-10 min-w-0 flex-[1_1_260px] rounded-lg border border-[var(--border-strong)] px-3 text-[13px]"
          />
          <button type="submit" className="btn-p min-h-10" disabled={!newRef.trim()}>
            Add
          </button>
          <button type="button" className="btn-s min-h-10" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="btn-s min-h-10 self-start rounded-lg px-3 text-[13px]" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          Add reference
        </button>
      )}
    </section>
  )
}

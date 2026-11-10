'use client'

// "+ Add question" at the end of the question list: opens a small form in place (short name for the
// list, the question as asked, what interviewers look for). Saved, the new question is selected (H3: Esc / Cancel leave).
import { useState, useTransition } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { addQuestion } from '../actions'
import { looksForLines } from '../types'

const FIELD = 'w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 py-2 text-[13.5px] leading-[1.45] placeholder:text-[#6b7180] focus:border-[var(--indigo)] focus:outline-none'
const LABEL = 'text-[12px] font-semibold text-[var(--text-2)]'

type Props = { onAdded: (id: string) => void }

export function AddQuestion({ onAdded }: Props) {
  const [open, setOpen] = useState(false)
  const [short, setShort] = useState('')
  const [full, setFull] = useState('')
  const [looksFor, setLooksFor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, start] = useTransition()

  const close = () => {
    setOpen(false)
    setShort('')
    setFull('')
    setLooksFor('')
    setError(null)
  }

  const save = () => {
    setError(null)
    start(async () => {
      const res = await addQuestion({ short, full, looksFor: looksForLines(looksFor) })
      if (!res.ok) {
        setError(res.error)
        return
      }
      close()
      onAdded(res.data.id)
    })
  }

  if (!open) {
    return (
      <button type="button" className="btn-s mx-1 mt-1.5 min-h-10 shrink-0 self-start rounded-lg px-3 text-[13px]" onClick={() => setOpen(true)}>
        <Icon name="plus" />
        Add question
      </button>
    )
  }

  return (
    <form
      aria-labelledby="aq-h"
      className="mx-1 mt-1.5 flex shrink-0 flex-col gap-2.5 rounded-lg border border-[var(--indigo-line)] bg-[var(--indigo-soft)] p-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close()
      }}
    >
      <h3 id="aq-h" className="m-0 text-[13px] font-semibold">
        New question
      </h3>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Short name for the list</span>
        <input autoFocus lang="pt-BR" value={short} onChange={(e) => setShort(e.target.value)} maxLength={80} placeholder="Ex.: Prazo apertado" className={FIELD} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>The question, as the interviewer asks it</span>
        <textarea
          lang="pt-BR"
          rows={3}
          value={full}
          onChange={(e) => setFull(e.target.value)}
          maxLength={1000}
          placeholder="Ex.: Conte sobre uma vez em que você teve que entregar algo com um prazo muito curto."
          className={`${FIELD} resize-y`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>
          What interviewers look for <span className="font-normal text-[var(--muted)]">· optional, one per line</span>
        </span>
        <textarea lang="pt-BR" rows={3} value={looksFor} onChange={(e) => setLooksFor(e.target.value)} placeholder={'Priorização\nComunicação com o time'} className={`${FIELD} resize-y`} />
      </label>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] font-medium text-[var(--amber-ink)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-p min-h-10" disabled={saving || !short.trim() || !full.trim()}>
          {saving ? 'Adding…' : 'Add question'}
        </button>
        <button type="button" className="btn-s min-h-10" onClick={close} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

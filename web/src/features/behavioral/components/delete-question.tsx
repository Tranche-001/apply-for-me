'use client'

// "Delete question", only on questions you added. Two steps in place (no browser dialog): Delete → "Delete it and
// its answers?" Yes / Keep it (H3, H5).
import { useState, useTransition } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { deleteQuestion } from '../actions'

type Props = { questionId: string; onDeleted: () => void }

export function DeleteQuestion({ questionId, onDeleted }: Props) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, start] = useTransition()

  const remove = () => {
    setError(null)
    start(async () => {
      const res = await deleteQuestion({ questionId })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onDeleted()
    })
  }

  if (!asking) {
    return (
      <button type="button" className="btn-s min-h-9 rounded-lg px-3 text-[13px]" onClick={() => setAsking(true)}>
        <Icon name="trash" />
        Delete question
      </button>
    )
  }

  return (
    <div role="group" aria-label="Confirm delete" className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-medium text-[var(--amber-ink)]">Delete it and its answers?</span>
      <button type="button" className="btn-s min-h-9 rounded-lg border-[var(--amber-line)] px-3 text-[13px]" onClick={remove} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Yes, delete'}
      </button>
      <button type="button" className="btn-s min-h-9 rounded-lg px-3 text-[13px]" onClick={() => setAsking(false)} disabled={deleting}>
        Keep it
      </button>
      {error && (
        <p role="alert" className="m-0 w-full text-[12.5px] font-medium text-[var(--amber-ink)]">
          {error}
        </p>
      )}
    </div>
  )
}

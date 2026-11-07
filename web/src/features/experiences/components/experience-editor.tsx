'use client'

import { useState } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { SaveStatus } from '@/features/ai/ui/save-status'
import type { SaveStatus as Status } from '@/features/ai/ui/use-autosave'
import { appendPrompt, PROMPTS, type ExperienceItem } from '../types'

type Props = {
  item: ExperienceItem
  saveStatus: Status
  saveError: string | null
  onChange: (patch: Partial<Pick<ExperienceItem, 'title' | 'where' | 'when' | 'notes'>>) => void
  onDelete: () => Promise<string | null>
}

function focusLater(id: string, atEnd = false) {
  setTimeout(() => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
    if (!el) return
    el.focus()
    if (atEnd) {
      const n = el.value.length
      el.setSelectionRange(n, n)
      el.scrollTop = el.scrollHeight
    }
  }, 30)
}

export function ExperienceEditor({ item, saveStatus, saveError, onChange, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const title = item.title.trim() || 'Untitled experience'

  const keep = () => {
    setConfirming(false)
    focusLater('x-del')
  }
  const confirmDelete = async () => {
    setDeleting(true)
    const error = await onDelete()
    setDeleting(false)
    setDeleteError(error)
  }

  return (
    <div className="flex min-h-0 flex-auto flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <label htmlFor="x-title" className="sr-only">
          Title
        </label>
        <input
          id="x-title"
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Where or what, e.g. Visio AI"
          className="-ml-2 h-10 min-w-0 flex-auto rounded-md border-0 bg-transparent px-2 text-[22px] font-semibold tracking-[-0.02em] hover:bg-[#f6f7f9] focus:bg-white focus:shadow-[0_0_0_2px_var(--indigo-line)] focus:outline-none"
        />
        <SaveStatus status={saveStatus} error={saveError} className="flex-[0_1_auto] text-right" />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        <div className="flex flex-[1_1_220px] flex-col gap-[3px]">
          <label htmlFor="x-where" className="text-[11.5px] font-medium text-[var(--muted)]">
            Where
          </label>
          <input
            id="x-where"
            value={item.where}
            onChange={(e) => onChange({ where: e.target.value })}
            placeholder="Company, group or project · city"
            className="h-8 rounded-md border border-[var(--border-strong)] bg-white px-2.5 text-[12.5px]"
          />
        </div>
        <div className="flex flex-[1_1_180px] flex-col gap-[3px]">
          <label htmlFor="x-when" className="text-[11.5px] font-medium text-[var(--muted)]">
            When
          </label>
          <input
            id="x-when"
            value={item.when}
            onChange={(e) => onChange({ when: e.target.value })}
            placeholder="e.g. March 2026 – Present"
            className="h-8 rounded-md border border-[var(--border-strong)] bg-white px-2.5 text-[12.5px]"
          />
        </div>
      </div>
      <div role="group" aria-labelledby="x-pr-l" className="flex flex-wrap items-center gap-1.5">
        <span id="x-pr-l" className="text-[11.5px] font-medium text-[var(--muted)]">
          Add a prompt:
        </span>
        {PROMPTS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onChange({ notes: appendPrompt(item.notes, label) })
              focusLater('x-text', true)
            }}
            className="inline-flex h-7 items-center gap-1 rounded-[14px] border border-[var(--border-strong)] bg-white px-2.5 text-[12px] font-medium text-[#22252c] hover:border-[var(--indigo)] hover:bg-[#f7f8ff] hover:text-[var(--indigo-hover)]"
          >
            <Icon name="plus" size={12} />
            {label}
          </button>
        ))}
      </div>
      <label htmlFor="x-text" className="sr-only">
        What you did at {title}
      </label>
      <textarea
        id="x-text"
        value={item.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="Write it the way you’d tell a friend: what you built, who it was for, what went wrong, what someone said about your work, numbers you remember. Stuck? Use a prompt above."
        className="min-h-[240px] flex-auto resize-none rounded-lg border border-[var(--border-strong)] bg-[#fcfcfd] px-3.5 py-3 text-[14px] leading-[1.6] text-[var(--text)] [field-sizing:content] placeholder:text-[#6b7180] focus:border-[var(--indigo)] focus:bg-white focus:shadow-[0_0_0_3px_#dde0fc] focus:outline-none"
      />
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {!confirming ? (
          <button
            id="x-del"
            type="button"
            onClick={() => {
              setConfirming(true)
              setDeleteError(null)
              focusLater('x-keep')
            }}
            className="-ml-2 inline-flex h-[30px] items-center gap-[5px] rounded-md border-0 bg-transparent px-2 text-[12.5px] font-medium text-[var(--danger)] hover:bg-[#fdf0ef]"
          >
            <Icon name="trash" size={13} />
            Delete experience
          </button>
        ) : (
          <div
            role="group"
            aria-labelledby="x-del-q"
            onKeyDown={(e) => {
              if (e.key === 'Escape') keep()
            }}
            className="flex flex-auto flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border border-[#f4c7c3] bg-[#fdf0ef] px-2.5 py-1.5"
          >
            <span id="x-del-q" className="flex-[1_1_220px] text-[12.5px] text-[#7a1a12]">
              {deleteError ?? `Delete “${title}”? The AI stops using these notes. Blocks made from them stay in your library.`}
            </span>
            <button
              type="button"
              disabled={deleting}
              onClick={confirmDelete}
              className="h-7 rounded-md border border-[var(--danger)] bg-[var(--danger)] px-3 text-[12px] font-semibold text-white hover:bg-[#912018]"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button id="x-keep" type="button" onClick={keep} className="btn-s h-7 px-3 text-[12px]">
              Keep
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

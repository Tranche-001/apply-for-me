'use client'

// What happened when the links were read, and "Paste the job text" for sites that block reading (H9).
import { useState } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import type { ReadResult } from '../types'

type Props = {
  results: ReadResult[] | null
  pasteOpen: boolean
  onOpenPaste: () => void
  onClosePaste: () => void
  onUsePasted: (text: string) => Promise<string | null>
  busy: boolean
}

export function ReadStatus({ results, pasteOpen, onOpenPaste, onClosePaste, onUsePasted, busy }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const use = async () => {
    const problem = await onUsePasted(text)
    setError(problem)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {results && results.length > 0 && (
        <ul aria-label="Links read" className="m-0 flex list-none flex-col gap-1 p-0">
          {results.map((r) => (
            <li key={r.url} className="flex items-start gap-1.5 text-[12px] leading-[1.4]">
              <span className={`mt-px flex h-4 w-4 flex-none items-center justify-center rounded ${r.ok ? 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'}`}>
                <Icon name={r.ok ? 'check' : 'x'} size={11} />
              </span>
              <span className="min-w-0">
                <span className="font-medium">{r.ok ? `Read ${r.title ? `“${r.title}”` : 'the posting'}` : 'Couldn’t read this link.'}</span>{' '}
                <span className="text-[var(--muted)]">{r.message ?? r.url}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {pasteOpen ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--amber-line)] bg-[var(--amber-soft)] p-3">
          <label htmlFor="paste-text" className="text-[13px] font-semibold text-[var(--amber-ink)]">
            Paste the job text
          </label>
          <p className="m-0 text-[12px] leading-[1.4] text-[var(--amber-ink)]">
            Open the posting in your browser, select all of its text, copy it and paste it here. It is saved with this job.
          </p>
          <textarea
            id="paste-text"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="resize-y rounded-md border border-[var(--border-strong)] bg-white px-2.5 py-2 text-[12.5px] leading-[1.5]"
          />
          {error && (
            <p role="alert" className="m-0 text-[12px] text-[var(--amber)]">
              {error}
            </p>
          )}
          <div className="flex gap-1.5">
            <button type="button" className="btn-p" disabled={!text.trim() || busy} onClick={() => void use()}>
              <Icon name="sparkle" />
              Use this text and analyze
            </button>
            <button type="button" className="btn-s" onClick={onClosePaste}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onOpenPaste} className="self-start border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--indigo)] underline">
          Paste the job text instead
        </button>
      )}
    </div>
  )
}

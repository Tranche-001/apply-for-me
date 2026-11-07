'use client'

import { Icon } from '@/features/ai/ui/icon'
import { matchesExperience, type ExperienceItem } from '../types'

type Props = {
  items: ExperienceItem[]
  selectedId: string | null
  query: string
  onQuery: (q: string) => void
  onSelect: (id: string) => void
}

export function ExperienceList({ items, selectedId, query, onQuery, onSelect }: Props) {
  const shown = items.filter((x) => matchesExperience(x, query))
  const searching = query.trim().length > 0
  return (
    <section
      aria-labelledby="xl-h"
      className="flex max-h-[calc(100vh-86px)] min-w-[250px] flex-[0_1_300px] flex-col gap-2 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-white p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="xl-h" className="m-0 text-[14px] font-semibold">
          Your experiences
        </h2>
        <span aria-live="polite" className="text-[11.5px] text-[var(--muted)]">
          {searching ? `${shown.length} of ${items.length}` : ''}
        </span>
      </div>
      <div className="relative flex items-center">
        <Icon name="search" className="pointer-events-none absolute left-2.5 text-[#6b7180]" />
        <label htmlFor="x-q" className="sr-only">
          Search experiences
        </label>
        <input
          id="x-q"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search experiences"
          className="h-8 w-full rounded-md border border-[var(--border-strong)] bg-white pl-[30px] pr-2.5 text-[12.5px] placeholder:text-[#6b7180]"
        />
      </div>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {shown.map((x) => {
          const current = x.id === selectedId
          const sub = [x.where, x.when].filter((s) => s.trim()).join(' · ')
          return (
            <li key={x.id}>
              <button
                id={`xi-${x.id}`}
                type="button"
                onClick={() => onSelect(x.id)}
                aria-current={current ? 'true' : undefined}
                className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-lg border-0 px-2.5 py-[7px] text-left ${
                  current ? 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)] hover:bg-[#e4e7fd]' : 'bg-transparent text-[var(--text)] hover:bg-[#f6f7f9]'
                }`}
              >
                <span className={`max-w-full truncate text-[13px] font-semibold ${x.title.trim() ? '' : 'italic text-[#6b7180]'}`}>
                  {x.title.trim() || 'Untitled experience'}
                </span>
                {sub && <span className="cv-serif max-w-full truncate text-[12px] italic text-[var(--muted)]">{sub}</span>}
                {!x.notes.trim() && (
                  <span className="mt-0.5 rounded border border-dashed border-[#d9a35b] bg-white px-1.5 text-[11px] font-semibold leading-[18px] text-[var(--amber)]">
                    Nothing written yet
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {searching && shown.length === 0 && <p className="m-0 px-0.5 py-1 text-[12.5px] text-[var(--muted)]">No experience matches “{query}”.</p>}
    </section>
  )
}

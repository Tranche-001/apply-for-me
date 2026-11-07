// Read → Compare → Your input → Drafts → Review & save (H1).
import { STEP_NAMES } from '../types'

export function Steps({ current }: { current: number }) {
  return (
    <ol aria-label="Progress" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {STEP_NAMES.map((label, i) => {
        const done = i < current
        const isCurrent = i === current
        return (
          <li
            key={label}
            aria-current={isCurrent ? 'step' : undefined}
            className={`inline-flex h-[26px] items-center gap-1.5 rounded-full bg-white pl-1 pr-2.5 text-[12px] font-medium ${
              isCurrent ? 'border border-[var(--indigo)] text-[var(--text)]' : 'border border-[var(--border)] text-[var(--text-2)]'
            }`}
          >
            <span
              className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
                done ? 'bg-[var(--indigo)] text-white' : isCurrent ? 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)]' : 'bg-[#f1f2f4] text-[var(--muted)]'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

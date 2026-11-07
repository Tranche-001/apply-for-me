import { saveStatusText, type SaveStatus as Status } from './use-autosave'

/** The autosave state next to what is being edited; announced politely to screen readers. */
export function SaveStatus({ status, error, className = '' }: { status: Status; error: string | null; className?: string }) {
  const tone = status === 'saved' ? 'text-[var(--ok)]' : status === 'error' ? 'text-[var(--amber)]' : 'text-[var(--muted)]'
  return (
    <span aria-live="polite" className={`text-[11.5px] font-medium ${tone} ${className}`}>
      {saveStatusText(status, error)}
    </span>
  )
}

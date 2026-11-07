// "What the AI did" after it rewrote something (P2, H1), with Undo (H3).
import { Icon } from './icon'

export function AiChanges({ changes, onUndo, onDismiss }: { changes: string[]; onUndo: () => void; onDismiss?: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12px] font-medium text-[var(--muted)]">AI draft:</span>
      {changes.map((c, i) => (
        <span key={`${i}-${c}`} className="inline-flex items-center rounded bg-[var(--indigo-soft)] px-2 py-[3px] text-[12px] font-medium text-[var(--indigo-hover)]">
          {c}
        </span>
      ))}
      <span className="flex-1" />
      <button type="button" onClick={onUndo} className="btn-s h-7 px-2.5 text-[12px]">
        <Icon name="undo" size={12} />
        Undo
      </button>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Hide what the AI did" className="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)]">
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  )
}

/** An AI error with Retry; the user's text is untouched (H9). */
export function AiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <p role="alert" className="m-0 rounded-lg border border-[var(--amber-line)] bg-[var(--amber-soft)] px-3 py-2 text-[13px] leading-[1.45] text-[var(--amber-ink)]">
      {message}
      {onRetry && (
        <>
          {' '}
          <button type="button" onClick={onRetry} className="border-0 bg-transparent p-0 font-semibold text-[var(--indigo)] underline">
            Retry
          </button>
        </>
      )}
    </p>
  )
}

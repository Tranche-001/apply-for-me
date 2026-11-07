'use client'

// Saves a moment after the last change (text fields autosave, docs/architecture.md).
// `queue(value)` restarts the timer with the newest value; `flush()` saves now (call it before
// switching to another item). A failed save keeps the text on screen and says so.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionResult } from '../result'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const OFFLINE = 'Couldn’t reach the app to save. Your text is still here; keep typing to retry.'

export function useAutosave<T>(
  save: (value: T) => Promise<ActionResult<unknown>>,
  options: { delay?: number; sameTarget?: (a: T, b: T) => boolean } = {},
) {
  const { delay = 700, sameTarget } = options
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<{ value: T } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(0)

  const run = useCallback(
    async (value: T) => {
      inFlight.current += 1
      setStatus('saving')
      let result: ActionResult<unknown>
      try {
        result = await save(value)
      } catch {
        result = { ok: false, error: OFFLINE }
      }
      inFlight.current -= 1
      if (!result.ok) {
        // Keep it waiting so the next change or leaving the screen tries again.
        if (!pending.current) pending.current = { value }
        setStatus('error')
        setError(result.error)
        return
      }
      if (inFlight.current === 0 && pending.current === null) {
        setStatus('saved')
        setError(null)
      }
    },
    [save],
  )

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const next = pending.current
    pending.current = null
    if (next) void run(next.value)
  }, [run])

  const queue = useCallback(
    (value: T) => {
      if (pending.current && sameTarget && !sameTarget(pending.current.value, value)) flush()
      pending.current = { value }
      setStatus('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush, sameTarget],
  )

  // Leaving the screen saves what is still waiting.
  useEffect(() => () => flush(), [flush])

  return { status, error, queue, flush }
}

/** "Saving… / ✓ Saved / Couldn't save…" in words (H1). */
export function saveStatusText(status: SaveStatus, error: string | null): string {
  if (status === 'saving') return 'Saving…'
  if (status === 'saved') return '✓ Saved'
  if (status === 'error') return error ?? 'Couldn’t save. Your text is still here.'
  return ''
}

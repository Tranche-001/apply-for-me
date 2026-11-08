'use client'

// Drag a whole row of a list (prototype next-ideas.html #order): press anywhere on the row except its buttons and
// menu, move, release. While you drag, the row takes the place under the pointer (the parent reorders through
// `onMoveTo`, the composition's moveTo); rows only move within their own group (a CV section).
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type Options = {
  /** Same block dropped on another: `from` takes `to`'s place (cv/composition moveTo). */
  onMoveTo: (fromId: string, toId: string) => void
  /** The drag ended; `moved` = the row changed place. */
  onDrop: (id: string, moved: boolean) => void
  /** Changes whenever the rows are drawn in a new order (the parent's rows). */
  drawn: unknown
}

/** Rows of one group, as drawn: `[data-row]` children of the `[data-group]` list. */
const rowsIn = (group: HTMLElement): HTMLElement[] => [...group.querySelectorAll<HTMLElement>(':scope > [data-row]')]

export function useRowDrag({ onMoveTo, onDrop, drawn }: Options) {
  const [dragging, setDragging] = useState<string | null>(null)
  const latest = useRef({ onMoveTo, onDrop })
  /** A move was asked for and the rows have not been drawn again yet: wait, so a stale layout never moves twice. */
  const pending = useRef(false)
  const stop = useRef<(() => void) | null>(null)

  useEffect(() => {
    latest.current = { onMoveTo, onDrop }
  }, [onMoveTo, onDrop])

  useLayoutEffect(() => {
    pending.current = false
  }, [drawn])

  // A drag still going when the list goes away (Save, Back to drafts) stops listening.
  useEffect(() => () => stop.current?.(), [])

  function onPointerDown(e: ReactPointerEvent<HTMLElement>, id: string): void {
    if (e.button > 0 || (e.target as HTMLElement).closest('button, [role="menu"], input, a')) return
    const row = e.currentTarget
    const group = row.parentElement
    if (!group) return
    e.preventDefault()
    row.focus({ preventScroll: true })
    setDragging(id)
    let moved = false

    const move = (ev: PointerEvent) => {
      if (pending.current) return
      const rows = rowsIn(group)
      const self = rows.findIndex((r) => r.dataset.row === id)
      const others = rows.filter((r) => r.dataset.row !== id)
      const after = others.findIndex((r) => {
        const box = r.getBoundingClientRect()
        return ev.clientY < box.top + box.height / 2
      })
      const want = after < 0 ? others.length : after
      if (self < 0 || want === self) return
      const target = want > self ? others[want - 1] : others[want]
      if (!target?.dataset.row) return
      pending.current = true
      moved = true
      latest.current.onMoveTo(id, target.dataset.row)
    }
    const remove = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      stop.current = null
    }
    function end() {
      remove()
      setDragging(null)
      latest.current.onDrop(id, moved)
    }
    stop.current = remove
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return { dragging, onPointerDown }
}

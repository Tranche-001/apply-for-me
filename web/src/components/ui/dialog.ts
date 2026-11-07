'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Focus the first element of a list of ids that exists and is enabled (after the next paint). */
export function focusFirst(ids: string[], delay = 30): void {
  window.setTimeout(() => {
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLElement | null
      if (el && !(el as HTMLButtonElement).disabled) {
        el.focus()
        return
      }
    }
  }, delay)
}

/** Close a popover when you press the mouse outside it (and outside its toggle button). */
export function useOutsideClose(open: boolean, refs: RefObject<HTMLElement | null>[], onClose: () => void): void {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as Node
      if (refs.some((r) => r.current?.contains(target))) return
      close.current()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // The refs are stable objects; only `open` changes the subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal focus: remembers what had focus, keeps Tab inside the dialog, and gives focus back on close
 * (H3: Esc, × and Cancel all leave; focus returns where you were).
 */
export function useModalFocus(open: boolean, dialog: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) window.setTimeout(() => opener.focus(), 0)
    }
  }, [open, dialog])
}

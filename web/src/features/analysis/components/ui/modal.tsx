'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { c } from './cx'

type Props = { label: string; onClose: () => void; children: ReactNode }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A run of popovers (requirement → full posting → back) swaps one Modal for another. They share the page
// control that opened the first one, and focus goes back to it only when the last one closes (H3).
let openCount = 0
let opener: HTMLElement | null = null
let restoreTimer: number | null = null

/**
 * The modal every Job analysis popover opens in: a scrim over the page; Esc, × and a click on the scrim
 * close it; Tab stays inside. A child that handles Esc itself (the "Goes to" list) calls preventDefault,
 * so the modal stays open.
 */
export function Modal({ label, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (restoreTimer !== null) {
      window.clearTimeout(restoreTimer)
      restoreTimer = null
    } else if (openCount === 0) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    openCount += 1
    return () => {
      openCount -= 1
      if (openCount > 0) return
      restoreTimer = window.setTimeout(() => {
        restoreTimer = null
        if (opener && document.contains(opener)) opener.focus()
        opener = null
      }, 0)
    }
  }, [])

  // When the content swaps and the focused button goes away, focus comes back into the dialog.
  useEffect(() => {
    const el = box.current
    if (el && !el.contains(document.activeElement)) el.focus()
  })

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = box.current
      if (!el) return
      if (ev.key === 'Escape') {
        if (ev.defaultPrevented) return
        ev.preventDefault()
        closeRef.current()
        return
      }
      if (ev.key !== 'Tab') return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
      if (!items.length) {
        ev.preventDefault()
        el.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!el.contains(active)) {
        ev.preventDefault()
        ;(ev.shiftKey ? last : first).focus()
      } else if (ev.shiftKey && (active === first || active === el)) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    <div
      className={c('modal-scrim')}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div ref={box} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={c('modal-box')}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

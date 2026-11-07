'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from '@/components/ui/dialog'
import { c } from './cx'

type Props = { label: string; onClose: () => void; children: ReactNode }

/**
 * The one modal every Job analysis popover opens in: a scrim over the page; Esc, × and a click on the scrim
 * close it, Tab stays inside and focus goes back where you were (H3). A child that handles Esc itself (the
 * "Goes to" list) calls preventDefault, so the modal stays open.
 */
export function Modal({ label, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null)
  useModalFocus(true, box)
  useEffect(() => {
    const el = box.current
    if (el && !el.contains(document.activeElement)) el.focus()
  }, [])
  return createPortal(
    <div
      className={c('modal-scrim')}
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={c('modal-box')}
        onKeyDown={(ev) => {
          if (ev.key !== 'Escape' || ev.defaultPrevented) return
          ev.stopPropagation()
          onClose()
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

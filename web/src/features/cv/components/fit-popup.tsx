'use client'

import { forwardRef } from 'react'
import { Icon, WarningTriangle } from '@/components/ui/icons'
import { C, btnS, cls, iconB } from '@/components/ui/styles'
import type { Fit } from '../layout'

export type FitFix = { key: string; text: string; action: string; label: string; onUse: () => void; onPeek?: () => void }

type PopupProps = {
  fit: Fit
  title: string
  detail: string
  fixes: FitFix[]
  onAllowTwo: (() => void) | null
  onClose: () => void
  onUnpeek: () => void
}

const amberButton = btnS(26, { flex: '0 0 auto', border: `1px solid ${C.amberButton}`, color: C.amber, fontSize: 12, fontWeight: 600 })

/** The yellow triangle by "This CV", shown only while the CV is over its page limit (decision log). */
export const FitButton = forwardRef<HTMLButtonElement, { title: string; open: boolean; onToggle: () => void }>(function FitButton({ title, open, onToggle }, ref) {
  return (
    <button ref={ref} id="fit-btn" type="button" className={`${cls.warnB} ${cls.iconB}`} onClick={onToggle} aria-expanded={open} aria-controls="fit-pop" title={title} style={iconB(28, { background: 'transparent' })}>
      <WarningTriangle />
      <span className="sr-only">{title}. Show ways to make it fit</span>
    </button>
  )
})

/** What spills over, and the fixes: a second page first, then shorter versions (hover to preview), then leaving achievements out. */
export const FitPopup = forwardRef<HTMLDivElement, PopupProps>(function FitPopup({ fit, title, detail, fixes, onAllowTwo, onClose, onUnpeek }, ref) {
  const hasFixes = fixes.some((f) => f.onPeek)
  return (
    <div
      ref={ref}
      id="fit-pop"
      role="dialog"
      aria-labelledby="fit-h"
      tabIndex={-1}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') onClose()
      }}
      style={{ position: 'absolute', zIndex: 6, top: 46, left: 8, right: 8, boxSizing: 'border-box', padding: 12, background: '#FFFFFF', border: `1px solid ${C.amberLine}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(20, 22, 27, 0.16)', display: 'flex', flexDirection: 'column', gap: 8, outline: 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h3 id="fit-h" style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: fit.over ? C.amber : C.okInk }}>{title}</h3>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45, color: C.text2 }}>{detail}</p>
        </div>
        <button type="button" className={cls.iconB} onClick={onClose} aria-label="Close" style={iconB(28)}>
          <Icon name="close" />
        </button>
      </div>
      {fit.over ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid #F6E3BF' }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: C.amberInk }}>
            {fixes.length || onAllowTwo ? 'Ways to make it fit' : 'None of these blocks has a shorter version. Remove a block or allow another page.'}
          </span>
          {onAllowTwo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>Keep everything and allow a second page</span>
              <button type="button" className={cls.btnS} onClick={onAllowTwo} style={btnS(26, { flex: '0 0 auto', fontSize: 12 })}>
                Allow 2 pages
              </button>
            </div>
          )}
          {fixes.map((f) => (
            <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>{f.text}</span>
              <button type="button" className={cls.btnS} onClick={f.onUse} onMouseEnter={f.onPeek} onMouseLeave={onUnpeek} onFocus={f.onPeek} onBlur={onUnpeek} aria-label={f.label} style={amberButton}>
                {f.action}
              </button>
            </div>
          ))}
          {hasFixes && <span style={{ fontSize: 11, color: C.muted }}>Hover a fix to see it on the page first.</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className={cls.btnS} onClick={onClose} style={btnS(30)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
})

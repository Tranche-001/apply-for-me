'use client'

import { useRef } from 'react'
import { useModalFocus, focusFirst } from '@/components/ui/dialog'
import { C, SANS, SERIF, backdrop, btnS, cls } from '@/components/ui/styles'
import { AddButton, ProfileSectionEditor, UndoToast } from '@/features/profile/components/profile-section-editor'
import { saveText, type ProfileStore } from '@/features/profile/components/use-profile-store'
import { PROFILE_HEADINGS, type ProfileKind } from '@/features/profile/types'

type Props = { kind: ProfileKind; store: ProfileStore; onClose: () => void }

/**
 * Edit one profile section in the middle of the screen, wide enough that it reads like the CV; the same
 * editor as the Profile page. The page behind updates as you type (decision log 2026-11-06).
 */
export function ProfileDialog({ kind, store, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useModalFocus(true, ref)
  const status = saveText(store.saveState, store.error, 'Saved to your profile')
  return (
    <div
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
      style={{ ...backdrop, zIndex: 90, padding: '24px 16px', background: 'rgba(20, 22, 27, 0.4)', alignItems: 'center' }}
    >
      <div
        ref={ref}
        id="pf-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-h"
        tabIndex={-1}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape') onClose()
        }}
        style={{ width: '100%', maxWidth: 760, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', boxSizing: 'border-box', padding: '24px 24px 14px 34px', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 24px 64px rgba(20, 22, 27, 0.3)', fontFamily: SERIF, color: C.paperInk, display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}
      >
        <h2 id="pf-h" style={{ margin: '0 10px 0 0', paddingBottom: 2, borderBottom: `1px solid ${C.paperInk}`, fontSize: 15, lineHeight: 1.25, fontWeight: 600, fontVariant: 'small-caps', letterSpacing: '0.03em' }}>
          {PROFILE_HEADINGS[kind]}
        </h2>
        <ProfileSectionEditor store={store} kind={kind} showAdd={false} />
        <div role="status">
          <UndoToast store={store} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginRight: 10, fontFamily: SANS }}>
          <AddButton store={store} kind={kind} />
          <span style={{ flex: '1 1 auto' }} />
          <span aria-live="polite" style={{ fontSize: 11.5, color: store.saveState === 'error' ? C.danger : C.muted }}>{status}</span>
          <button
            type="button"
            className={cls.btnS}
            onClick={() => {
              store.flushAll()
              onClose()
            }}
            style={btnS(30, { padding: '0 14px' })}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export function focusProfileDialog(): void {
  focusFirst(['pf-pop'])
}

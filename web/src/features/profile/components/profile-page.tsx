'use client'

import { Icon } from '@/components/ui/icons'
import { C, SERIF, cls } from '@/components/ui/styles'
import { PROFILE_HEADINGS, type ProfileData, type ProfileKind } from '../types'
import { ProfileSectionEditor, UndoToast } from './profile-section-editor'
import { saveText, useProfileStore } from './use-profile-store'

// Anchors the nav links to (#education, #skills, #achievements).
const SECTIONS: { kind: ProfileKind; anchor: string }[] = [
  { kind: 'education', anchor: 'education' },
  { kind: 'skills', anchor: 'skills' },
  { kind: 'achievements', anchor: 'achievements' },
]

export function ProfilePage({ initial }: { initial: ProfileData }) {
  const store = useProfileStore(initial)
  const status = saveText(store.saveState, store.error)
  const isError = store.saveState === 'error'
  return (
    <div style={{ height: 'calc(100vh - 28px)', minHeight: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <header style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '6px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 12px' }}>
            <p className="eyebrow">PROFILE</p>
            <h1 className="page-title">The parts of your CV that aren’t blocks</h1>
          </div>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: C.muted }}>Every CV uses these. Edits apply to new CVs and to CVs you open again.</p>
        </div>
        <span aria-live="polite" style={{ minHeight: 18, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: isError ? C.danger : store.saveState === 'saved' ? C.ok : C.muted }}>
          {store.saveState === 'saved' && <Icon name="check" />}
          {status}
        </span>
      </header>

      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', boxSizing: 'border-box', padding: '16px 12px 0', borderRadius: 10, background: C.previewBg, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: '100%', maxWidth: 760, boxSizing: 'border-box', background: '#FFFFFF', padding: '26px 34px 30px', boxShadow: '0 6px 20px rgba(20, 22, 27, 0.1)', fontFamily: SERIF, color: C.paperInk, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {SECTIONS.map(({ kind, anchor }) => (
            <section key={kind} id={anchor} aria-labelledby={`${anchor}-h`} style={{ scrollMarginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 id={`${anchor}-h`} className={cls.secH} tabIndex={-1} style={{ margin: 0, paddingBottom: 2, borderBottom: `1px solid ${C.paperInk}`, fontSize: 15, lineHeight: 1.25, fontWeight: 600, fontVariant: 'small-caps', letterSpacing: '0.03em' }}>
                {PROFILE_HEADINGS[kind]}
              </h2>
              <ProfileSectionEditor store={store} kind={kind} />
            </section>
          ))}
        </div>
        <div role="status" aria-live="polite" style={{ position: 'sticky', bottom: 12, zIndex: 2, width: '100%', minHeight: 16, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <UndoToast store={store} floating />
        </div>
      </div>
    </div>
  )
}

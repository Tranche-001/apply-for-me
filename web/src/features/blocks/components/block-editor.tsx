'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useModalFocus, focusFirst } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icons'
import { C, MONO, SANS, SERIF, backdrop, btnP, btnS, cls, cvField, iconB, linkButton } from '@/components/ui/styles'
import { KIND_OPTIONS, blankBullet, kindName, kindTone, type EditorBullet, type EditorDraft, type PrintableKind } from '../bullets'

let bulletSeq = 0
/** Ids for editor bullets; only called from event handlers. */
export function newBulletId(): string {
  bulletSeq += 1
  return `eb${bulletSeq}`
}

export const EDITOR_TITLE_ID = 'ed-title'

function bulletRows(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 100))
}

const area = { resize: 'none', fieldSizing: 'content' } as CSSProperties

/** The P / S / I legend in the dialog header. */
export function KindLegend() {
  const tag = (letter: string, color: string) => <strong style={{ fontFamily: MONO, color }}>{letter}</strong>
  return (
    <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
      {tag('P', C.indigoInk)} project · {tag('S', '#334155')} stack · {tag('I', C.okInk)} impact
    </span>
  )
}

type DialogProps = {
  labelledBy: string
  header: ReactNode
  children: ReactNode
  /** Between the body and the footer: "Save as" cards, a warning. */
  extra?: ReactNode
  status: ReactNode
  saveLabel: string
  saveDisabled: boolean
  busy: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
  /** Footer controls before Cancel (the job link in the library). */
  footerStart?: ReactNode
  maxWidth?: number
}

/** The large edit dialog. Esc, × and Cancel all leave without saving (H3). */
export function EditorDialog({ labelledBy, header, children, extra, status, saveLabel, saveDisabled, busy, error, onSave, onCancel, footerStart, maxWidth = 820 }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null)
  useModalFocus(true, ref)
  return (
    <div
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') {
          ev.stopPropagation()
          onCancel()
        }
      }}
      style={{ ...backdrop, zIndex: 100, padding: '48px 16px 24px', background: 'rgba(20, 22, 27, 0.5)', alignItems: 'flex-start' }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} style={{ width: '100%', maxWidth, boxSizing: 'border-box', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 24px 64px rgba(20, 22, 27, 0.3)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: C.text, fontSize: 13 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', padding: '8px 8px 8px 16px', borderBottom: `1px solid ${C.hairline}` }}>
          {header}
          <span style={{ flex: '1 1 auto' }} />
          <KindLegend />
          <button type="button" className={cls.iconB} onClick={onCancel} aria-label="Close without saving" style={iconB(28)}>
            <Icon name="close" />
          </button>
        </div>
        {children}
        {extra}
        {error && (
          <p role="alert" style={{ margin: '8px 16px 0', padding: '6px 10px', borderRadius: 6, background: '#FEF3F2', border: '1px solid #FECDCA', color: C.danger, fontSize: 12.5 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 16px', borderTop: `1px solid ${C.hairline}` }}>
          {footerStart}
          <span role="status" style={{ flex: '1 1 260px', fontSize: 12 }}>
            {status}
          </span>
          <button type="button" className={cls.btnS} onClick={onCancel} style={btnS(30)}>
            Cancel
          </button>
          <button type="button" className={cls.btnP} onClick={onSave} disabled={saveDisabled || busy} style={btnP(30)}>
            {busy ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type FieldsProps = {
  draft: EditorDraft
  onChange: (draft: EditorDraft) => void
  /** Under the title: the italic context line, or the new block's organization · place · dates or stack. */
  meta?: ReactNode
  titlePlaceholder?: string
  /** What gets focus when the dialog opens (the title, or a new block's name). */
  initialFocusId?: string
}

/** Title and bullets, laid out like the CV entry: lines break about where they will on the page. */
export function VersionFields({ draft, onChange, meta, titlePlaceholder, initialFocusId = EDITOR_TITLE_ID }: FieldsProps) {
  const focusTarget = useRef(initialFocusId)
  useEffect(() => {
    focusFirst([focusTarget.current, EDITOR_TITLE_ID])
  }, [])

  const setBullets = (bullets: EditorBullet[]) => onChange({ ...draft, bullets })
  const update = (id: string, patch: Partial<EditorBullet>) => setBullets(draft.bullets.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= draft.bullets.length) return
    setBullets(draft.bullets.map((b, k) => (k === index ? draft.bullets[j] : k === j ? draft.bullets[index] : b)))
  }
  const add = () => {
    const id = newBulletId()
    setBullets([...draft.bullets, blankBullet(id, 'IMPACT')])
    focusFirst([`et-${id}`])
  }
  const small = iconB(24, { borderRadius: 4, color: C.faint })

  return (
    <div style={{ padding: '20px 28px 8px', fontFamily: SERIF, color: C.paperInk, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label htmlFor={EDITOR_TITLE_ID} className="sr-only">Title</label>
      <input
        id={EDITOR_TITLE_ID}
        className={cls.cvIn}
        value={draft.title}
        onChange={(ev) => onChange({ ...draft, title: ev.target.value })}
        placeholder={titlePlaceholder}
        style={cvField({ height: 28, marginLeft: -6, fontSize: 15, fontWeight: 700 })}
      />
      {meta}
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {draft.bullets.map((b, i) => {
          const tone = kindTone(b.kind)
          const gapEmpty = !!b.want && !b.text.trim()
          return (
            <li key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <label htmlFor={`ek-${b.id}`} className="sr-only">Type of bullet {i + 1}</label>
              <select
                id={`ek-${b.id}`}
                title={kindName(b.kind)}
                value={b.kind}
                onChange={(ev) => update(b.id, { kind: ev.target.value as PrintableKind })}
                style={{ flex: '0 0 48px', height: 22, marginTop: 2, boxSizing: 'border-box', padding: '0 2px', border: 0, borderRadius: 4, fontFamily: MONO, fontSize: 10, fontWeight: 600, background: tone.background, color: tone.color }}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" style={{ flex: '0 0 auto', paddingTop: 3, fontSize: 13 }}>•</span>
              <label htmlFor={`et-${b.id}`} className="sr-only">Text of bullet {i + 1}</label>
              <textarea
                id={`et-${b.id}`}
                className={cls.cvIn}
                rows={bulletRows(b.text)}
                value={b.text}
                onChange={(ev) => update(b.id, { text: ev.target.value })}
                placeholder={b.want ? `Missing ${kindName(b.want).toLowerCase()} bullet. Write it, or leave it empty to keep the gap.` : 'Start with a verb and put a number in it'}
                style={cvField({ ...area, flex: '1 1 auto', padding: '2px 6px', fontSize: 13, lineHeight: 1.45, background: gapEmpty ? '#FFF8EE' : 'transparent' })}
              />
              <span style={{ flex: '0 0 auto', display: 'flex', fontFamily: SANS }}>
                <button type="button" className={cls.iconB} aria-label={`Move bullet ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0} style={small}>
                  <Icon name="chevronUp" size={13} />
                </button>
                <button type="button" className={cls.iconB} aria-label={`Move bullet ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === draft.bullets.length - 1} style={small}>
                  <Icon name="chevronDown" size={13} />
                </button>
                <button type="button" className={cls.iconB} aria-label={`Remove bullet ${i + 1}`} onClick={() => setBullets(draft.bullets.filter((x) => x.id !== b.id))} disabled={draft.bullets.length === 1} style={small}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      <div style={{ padding: '6px 0 0 54px', fontFamily: SANS }}>
        <button type="button" className={cls.addB} onClick={add} style={linkButton}>
          <Icon name="plus" size={13} />
          Add bullet
        </button>
      </div>
    </div>
  )
}

/** Italic line under the title of an existing block. */
export function EditorMeta({ text }: { text: string }) {
  return <span style={{ fontSize: 12.5, fontStyle: 'italic' }}>{text}</span>
}

/** A "Save as" option card, outlined in indigo when chosen (decision log 2026-11-06). */
export function SaveAsCard({ checked, onSelect, label, children, name }: { checked: boolean; onSelect: () => void; label: ReactNode; children: ReactNode; name: string }) {
  return (
    <div
      onClick={onSelect}
      style={{
        flex: '1 1 280px',
        minWidth: 0,
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: 10,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        transition: 'border-color .15s, background-color .15s',
        ...(checked ? { border: `1px solid ${C.indigo}`, background: '#F7F7FE', boxShadow: `0 0 0 1px ${C.indigo}` } : { border: `1px solid ${C.border}`, background: '#FFFFFF' }),
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text, cursor: 'pointer' }}>
        <input type="radio" name={name} checked={checked} onChange={onSelect} style={{ width: 15, height: 15, margin: 0, accentColor: C.indigo }} />
        <span>{label}</span>
      </label>
      <span style={{ paddingLeft: 23, fontSize: 12, lineHeight: 1.4, color: C.muted }}>{children}</span>
    </div>
  )
}

'use client'

import { useRef, useState, type DragEvent } from 'react'
import { useOutsideClose } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icons'
import { C, MONO, SANS, SERIF, cls, iconB, popover } from '@/components/ui/styles'
import { blockContext, identicalTo, kindAbbr, kindName, kindTone, pickerOrder, printable } from '../bullets'
import type { LibBlock, LibVersion } from '../types'

export type CardDrag = {
  dragging: boolean
  over: boolean
  draggable: boolean
  onDragStart: (ev: DragEvent) => void
  onDragOver: (ev: DragEvent) => void
  onDrop: (ev: DragEvent) => void
  onDragEnd: () => void
}

type Props = {
  block: LibBlock
  index: number
  total: number
  shown: LibVersion
  jobLabels: Record<string, string>
  verOpen: boolean
  onToggleVersions: () => void
  onCloseVersions: () => void
  onPick: (versionId: string) => void
  onMerge: (fromId: string, intoId: string) => void
  onDuplicate: () => void
  onEdit: () => void
  onMove: (dir: -1 | 1) => void
  drag: CardDrag
}

const versionName = (v: LibVersion) => v.name || 'Untitled version'

function VersionMenu({ block, shown, jobLabels, onPick, onMerge, onDuplicate, onClose }: Pick<Props, 'block' | 'shown' | 'jobLabels' | 'onPick' | 'onMerge' | 'onDuplicate'> & { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = pickerOrder(block.versions).filter((v) => !q || [v.name, v.title, ...v.jobIds.map((id) => jobLabels[id] ?? '')].join(' ').toLowerCase().includes(q))
  return (
    <div
      role="dialog"
      aria-label={`Versions of ${block.name}`}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape') onClose()
      }}
      style={{ ...popover, position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', right: 0, width: 400, maxWidth: 'calc(100vw - 48px)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: SANS }}
    >
      <label htmlFor={`ver-q-${block.id}`} className="sr-only">Find a version</label>
      {/* Opening the list is the moment to type a name; focus goes to the search. */}
      <input id={`ver-q-${block.id}`} type="search" className={cls.field} autoFocus value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Find a version by name, title or job" style={{ minHeight: 36, boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontSize: 13.5 }} />
      <div style={{ maxHeight: 340, overflowY: 'auto', margin: '0 -4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((v) => {
          const on = v.id === shown.id
          const dup = identicalTo(v, block.versions)
          return (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 6, borderRadius: 8, background: on ? C.indigoSoft : 'transparent' }}>
              <button type="button" className={cls.opt} onClick={() => onPick(v.id)} aria-pressed={on} style={{ flex: '1 1 auto', minWidth: 0, minHeight: 40, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '6px 10px', border: 0, borderRadius: 8, background: 'transparent' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 600, color: C.text }}>
                  {versionName(v)}
                  {v.isBase && <BaseTag />}
                </span>
                {dup && <span style={{ fontSize: 12, lineHeight: 1.4, color: C.amber }}>Identical to “{versionName(dup)}”</span>}
              </button>
              {dup && (
                <button type="button" className={cls.btnS} onClick={() => onMerge(v.id, dup.id)} aria-label={`Merge ${versionName(v)} into ${versionName(dup)}`} style={{ flex: '0 0 auto', minHeight: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.amberButton}`, background: '#FFFFFF', color: C.amber, fontSize: 12, fontWeight: 600 }}>
                  Merge
                </button>
              )}
            </div>
          )
        })}
        {rows.length === 0 && <p style={{ margin: 0, padding: '10px 8px', fontSize: 13, color: C.muted }}>No version matches “{query}”.</p>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.hairline}` }}>
        <span style={{ fontSize: 12, color: C.muted }}>Base first, then most used</span>
        <button type="button" className={cls.btnS} onClick={onDuplicate} style={{ minHeight: 34, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.borderStrong}`, background: '#FFFFFF', fontSize: 13, fontWeight: 500, color: C.ink }}>
          <Icon name="copy" />
          Duplicate this version
        </button>
      </div>
    </div>
  )
}

export function BaseTag() {
  return <span style={{ padding: '1px 5px', borderRadius: 4, background: '#F1F2F4', color: C.text2, fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em' }}>BASE</span>
}

/** A library card, laid out like the CV entry it prints (decision log: cards "like the CV"). */
export function BlockCard({ block, index, total, shown, jobLabels, verOpen, onToggleVersions, onCloseVersions, onPick, onMerge, onDuplicate, onEdit, onMove, drag }: Props) {
  const menuBox = useRef<HTMLDivElement>(null)
  useOutsideClose(verOpen, [menuBox], onCloseVersions)
  const base = block.versions.find((v) => v.isBase) ?? block.versions[0]
  const isBase = shown.id === base.id
  const dup = identicalTo(shown, block.versions)
  const diffLine = dup ? `Identical to “${versionName(dup)}”` : !isBase && shown.title !== base.title ? 'Title changed' : ''
  const usage = shown.jobIds.map((id) => jobLabels[id]).filter(Boolean)
  return (
    <li
      draggable={drag.draggable}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
      onDragEnd={drag.onDragEnd}
      style={{ display: 'block', background: '#FFFFFF', borderRadius: 12, padding: '16px 16px 14px', border: `1px solid ${drag.over ? C.indigo : C.border}`, boxShadow: drag.over ? '0 0 0 3px #DDE0FC' : '0 1px 2px rgba(20, 22, 27, 0.04)', opacity: drag.dragging ? 0.45 : 1 }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div aria-hidden="true" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 2, color: C.faint, cursor: 'grab' }}>
          <Icon name="grip" size={18} />
          <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{String(index + 1).padStart(2, '0')}</span>
        </div>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '8px 12px' }}>
            <div style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, fontFamily: SERIF, color: C.paperInk }}>
              <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, lineHeight: 1.3 }}>{shown.title}</h2>
              <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
                <span style={{ fontSize: 12.5, fontStyle: 'italic' }}>{blockContext(block) || block.name}</span>
                {diffLine && <span style={{ fontFamily: SANS, fontSize: 11.5, color: dup ? C.amber : C.muted, fontWeight: dup ? 500 : 400 }}>{diffLine}</span>}
              </span>
            </div>
            <div style={{ flex: '0 0 auto', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <div ref={menuBox} style={{ position: 'relative' }}>
                <button type="button" className={cls.btnS} onClick={onToggleVersions} aria-expanded={verOpen} aria-haspopup="dialog" aria-label={`Version: ${versionName(shown)}, ${block.versions.length} versions. Change the version of ${block.name}`} style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 8px 0 10px', borderRadius: 8, border: `1px solid ${C.borderStrong}`, background: '#FFFFFF', fontSize: 12.5, color: C.ink }}>
                  <span style={{ color: C.muted }}>Version</span>
                  <span style={{ fontWeight: 600 }}>{versionName(shown)}</span>
                  <span style={{ padding: '1px 7px', borderRadius: 999, background: '#F1F2F4', color: C.text2, fontSize: 11, fontWeight: 500 }}>{block.versions.length} {block.versions.length === 1 ? 'version' : 'versions'}</span>
                  <Icon name="chevronDown" size={15} />
                </button>
                {verOpen && <VersionMenu block={block} shown={shown} jobLabels={jobLabels} onPick={onPick} onMerge={onMerge} onDuplicate={onDuplicate} onClose={onCloseVersions} />}
              </div>
              <button type="button" className={cls.btnS} onClick={onDuplicate} aria-label="Duplicate this version and edit the copy" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px', borderRadius: 8, border: '1px dashed #B9BDC6', background: '#FFFFFF', fontSize: 12, fontWeight: 500, color: C.muted }}>
                <Icon name="copy" size={13} />
                Duplicate &amp; edit
              </button>
              <span aria-hidden="true" style={{ width: 1, height: 20, margin: '0 4px', background: C.border }} />
              <button type="button" className={cls.iconB} aria-label={`Move ${block.name} up`} onClick={() => onMove(-1)} disabled={index === 0} style={iconB(32, { borderRadius: 8 })}>
                <Icon name="chevronUp" size={17} />
              </button>
              <button type="button" className={cls.iconB} aria-label={`Move ${block.name} down`} onClick={() => onMove(1)} disabled={index === total - 1} style={iconB(32, { borderRadius: 8 })}>
                <Icon name="chevronDown" size={17} />
              </button>
              <button type="button" className={cls.iconB} aria-label={`Edit the ${versionName(shown)} version of ${block.name}`} onClick={onEdit} style={iconB(32, { borderRadius: 8 })}>
                <Icon name="edit" size={16} />
              </button>
            </div>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: SERIF, color: C.paperInk }}>
            {shown.bullets.map((b, k) => {
              const tone = kindTone(b.kind)
              const gap = b.kind === 'MISSING'
              const changed = !isBase && !gap && !!base.bullets[k] && base.bullets[k].text !== b.text
              const kindText = gap ? `Missing ${kindName(printable(b.want)).toLowerCase()} bullet` : kindName(printable(b.kind))
              return (
                <li key={k} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span aria-hidden="true" title={kindText} style={{ flex: '0 0 36px', marginTop: 2, boxSizing: 'border-box', textAlign: 'center', padding: '2px 0', borderRadius: 4, fontFamily: MONO, fontSize: 10, fontWeight: 600, ...tone }}>
                    {kindAbbr(b)}
                  </span>
                  <span aria-hidden="true" style={{ flex: '0 0 auto', paddingTop: 1, fontSize: 13.5 }}>•</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13.5, lineHeight: 1.45, ...(gap ? { color: C.amber, fontStyle: 'italic' } : {}) }}>
                    <span className="sr-only">{kindText}: </span>
                    {b.text}
                    {changed && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 3, background: C.amberSoft, color: C.amber, fontFamily: MONO, fontSize: 9.5, fontWeight: 600, fontStyle: 'normal', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>CHANGED</span>}
                  </span>
                </li>
              )
            })}
          </ul>
          {(shown.themes.length > 0 || usage.length > 0) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}>
              {shown.themes.map((t) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: '#FAFAFB', fontSize: 12, fontWeight: 500, color: C.text2 }}>{t}</span>
              ))}
              {usage.length > 0 && <span style={{ fontSize: 12, color: C.muted }}>Used in {usage.join(', ')}</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

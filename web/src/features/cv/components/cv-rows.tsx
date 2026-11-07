'use client'

import type { CSSProperties, DragEvent } from 'react'
import type { Section } from '@prisma/client'
import { Icon } from '@/components/ui/icons'
import { C, MONO, SERIF, btnS, cls, iconB } from '@/components/ui/styles'
import { BaseTag } from '@/features/blocks/components/block-card'
import { kindName, printable } from '@/features/blocks/bullets'
import type { LibBlock } from '@/features/blocks/types'
import { PROFILE_HEADINGS, type ProfileKind } from '@/features/profile/types'
import type { Composition } from '../composition'
import { SECTION_NAMES } from '../layout'

export type RowDrag = { id: string | null; over: string | null; overSec: Section | null }

type Props = {
  comp: Composition
  blocks: Map<string, LibBlock>
  jobId: string | null
  verOpen: string | null
  verQuery: string
  hoverId: string | null
  flashId: string | null
  drag: RowDrag
  onVerQuery: (q: string) => void
  onToggleVer: (blockId: string) => void
  onCloseVer: () => void
  onPickVersion: (blockId: string, versionId: string) => void
  onPeek: (blockId: string, versionId: string) => void
  onUnpeek: () => void
  onMove: (blockId: string, dir: -1 | 1) => void
  onMoveSection: (section: Section, dir: -1 | 1) => void
  onRemove: (blockId: string) => void
  onEdit: (blockId: string) => void
  onHover: (blockId: string | null) => void
  onDrag: (drag: RowDrag) => void
  onDropOnRow: (fromId: string, toId: string) => void
  onDropOnSection: (fromId: string, section: Section) => void
}

const SEARCH_FROM = 5
const ABBR: Record<string, string> = { PROJECT: 'P', STACK: 'S', IMPACT: 'I' }

export function editButtonId(blockId: string): string {
  return `ed-btn-${blockId}`
}

/** The CV's blocks in print order: sections you can reorder, rows you can drag (H7: drag and arrows). */
export function SectionList(p: Props) {
  const { comp } = p
  return (
    <>
      {comp.order.map((section, si) => {
        const rows = comp.items[section]
        const dropping = p.drag.overSec === section && !!p.drag.id
        return (
          <div key={section} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 2px 0 4px' }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted }}>{SECTION_NAMES[section]}</h3>
              <span style={{ marginLeft: 'auto' }} />
              <button type="button" className={cls.iconB} onClick={() => p.onMoveSection(section, -1)} disabled={si === 0} aria-label={`Move ${SECTION_NAMES[section]} section up`} style={iconB(24, { color: C.faint })}>
                <Icon name="chevronUp" />
              </button>
              <button type="button" className={cls.iconB} onClick={() => p.onMoveSection(section, 1)} disabled={si === comp.order.length - 1} aria-label={`Move ${SECTION_NAMES[section]} section down`} style={iconB(24, { color: C.faint })}>
                <Icon name="chevronDown" />
              </button>
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rows.map((row, idx) => {
                const block = p.blocks.get(row.blockId)
                if (!block) return null
                return <Row key={row.blockId} {...p} block={block} versionId={row.versionId} isFirst={idx === 0} isLast={idx === rows.length - 1} />
              })}
            </ol>
            {rows.length === 0 && (
              <div
                onDragOver={(ev) => {
                  ev.preventDefault()
                  if (p.drag.overSec !== section) p.onDrag({ ...p.drag, over: null, overSec: section })
                }}
                onDrop={(ev) => {
                  ev.preventDefault()
                  const from = p.drag.id
                  p.onDrag({ id: null, over: null, overSec: null })
                  if (from) p.onDropOnSection(from, section)
                }}
                style={{ padding: 10, borderRadius: 8, textAlign: 'center', fontSize: 12, color: C.muted, border: `1px dashed ${dropping ? C.indigo : C.borderStrong}`, background: dropping ? C.indigoSoft : 'transparent' }}
              >
                Nothing here yet. Add a block below or drag one here. An empty section is left off the CV.
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function Row(p: Props & { block: LibBlock; versionId: string; isFirst: boolean; isLast: boolean }) {
  const { block } = p
  const cur = block.versions.find((v) => v.id === p.versionId) ?? block.versions[0]
  const open = p.verOpen === block.id
  const gap = cur.bullets.find((b) => b.kind === 'MISSING')
  const gapName = gap ? kindName(printable(gap.want)).toLowerCase() : ''
  const over = p.drag.over === block.id && !!p.drag.id && p.drag.id !== block.id
  const q = p.verQuery.trim().toLowerCase()
  const versions = block.versions.filter((v) => !q || `${v.name} ${v.title}`.toLowerCase().includes(q))

  let rowStyle: CSSProperties = { background: 'transparent', border: '1px solid transparent' }
  if (open || p.hoverId === block.id) rowStyle = { background: C.well, border: `1px solid ${C.border}` }
  if (p.flashId === block.id) rowStyle = { background: C.indigoSoft, border: `1px solid ${C.indigoLine}` }
  if (over) rowStyle = { background: '#FFFFFF', border: `1px solid ${C.indigo}`, boxShadow: '0 0 0 3px #DDE0FC' }
  if (p.drag.id === block.id) rowStyle = { ...rowStyle, opacity: 0.45 }

  return (
    <li
      id={`row-${block.id}`}
      draggable={!open}
      onDragStart={(ev: DragEvent) => {
        ev.dataTransfer.effectAllowed = 'move'
        ev.dataTransfer.setData('text/plain', block.id)
        p.onDrag({ id: block.id, over: null, overSec: null })
      }}
      onDragOver={(ev) => {
        ev.preventDefault()
        if (p.drag.over !== block.id) p.onDrag({ ...p.drag, over: block.id, overSec: null })
      }}
      onDrop={(ev) => {
        ev.preventDefault()
        const from = p.drag.id
        p.onDrag({ id: null, over: null, overSec: null })
        if (from && from !== block.id) p.onDropOnRow(from, block.id)
      }}
      onDragEnd={() => p.onDrag({ id: null, over: null, overSec: null })}
      onMouseEnter={() => p.onHover(block.id)}
      onMouseLeave={() => p.onHover(null)}
      style={{ display: 'block', boxSizing: 'border-box', padding: '6px 4px', borderRadius: 8, transition: 'background-color .35s ease', ...rowStyle }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{ flex: '0 0 auto', display: 'flex', color: C.faint, cursor: 'grab' }}>
          <Icon name="grip" size={16} />
        </span>
        <button type="button" id={editButtonId(block.id)} className={cls.rowEd} onClick={() => p.onEdit(block.id)} style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1, margin: '-3px 0', padding: '3px 6px', border: 0, borderRadius: 6, background: 'transparent', textAlign: 'left' }}>
          <span className="sr-only">Edit </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: C.text }}>
            {block.name}
            {gap && (
              <span title={`This version has no ${gapName} bullet`} style={{ padding: '0 4px', borderRadius: 4, border: '1px dashed #D9A35B', background: '#FFFFFF', color: C.amber, fontFamily: MONO, fontSize: 10, fontWeight: 600 }}>
                <span aria-hidden="true">{ABBR[printable(gap.want)] ?? 'I'}?</span>
                <span className="sr-only">This version has no {gapName} bullet</span>
              </span>
            )}
            <span className={cls.rowPen} style={{ display: 'flex', color: C.muted }}>
              <Icon name="pencil" size={13} />
            </span>
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SERIF, fontSize: 12, fontStyle: 'italic', color: C.muted }}>{cur.title}</span>
        </button>
        <button type="button" className={cls.btnS} onClick={() => p.onToggleVer(block.id)} aria-expanded={open} aria-label={`Version: ${cur.name || 'Untitled version'}. Change version of ${block.name}`} style={btnS(28, { flex: '0 0 auto', gap: 4, padding: '0 6px 0 9px', borderRadius: 7, fontSize: 12, fontWeight: 600 })}>
          {cur.name || 'Untitled version'}
          <Icon name="chevronDown" />
        </button>
        <button type="button" className={cls.iconB} onClick={() => p.onMove(block.id, -1)} disabled={p.isFirst} aria-label={`Move ${block.name} up`} style={iconB(26)}>
          <Icon name="chevronUp" size={15} />
        </button>
        <button type="button" className={cls.iconB} onClick={() => p.onMove(block.id, 1)} disabled={p.isLast} aria-label={`Move ${block.name} down`} style={iconB(26)}>
          <Icon name="chevronDown" size={15} />
        </button>
        <button type="button" className={cls.iconB} onClick={() => p.onRemove(block.id)} aria-label={`Remove ${block.name} from this CV`} style={iconB(26)}>
          <Icon name="close" size={15} />
        </button>
      </div>
      {open && (
        <div
          role="group"
          aria-label={`Versions of ${block.name}`}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') p.onCloseVer()
          }}
          onMouseLeave={p.onUnpeek}
          style={{ margin: '6px 0 2px 22px', padding: 6, border: `1px solid ${C.borderStrong}`, borderRadius: 8, background: '#FFFFFF', boxShadow: '0 4px 14px rgba(20, 22, 27, 0.08)', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {block.versions.length > SEARCH_FROM && (
            <input type="search" aria-label="Find a version" className={cls.field} value={p.verQuery} onChange={(ev) => p.onVerQuery(ev.target.value)} placeholder="Find a version by name or title" style={{ height: 30, marginBottom: 4, boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.borderStrong}`, borderRadius: 6, fontSize: 12.5 }} />
          )}
          {versions.map((v) => {
            const on = v.id === cur.id
            return (
              <button key={v.id} type="button" className={cls.opt} onClick={() => p.onPickVersion(block.id, v.id)} onMouseEnter={() => p.onPeek(block.id, v.id)} onFocus={() => p.onPeek(block.id, v.id)} aria-pressed={on} style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', border: 0, borderRadius: 6, textAlign: 'left', background: on ? C.indigoSoft : 'transparent' }}>
                <span aria-hidden="true" style={{ width: 14, display: 'flex', color: C.indigo }}>{on && <Icon name="check" />}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{v.name || 'Untitled version'}</span>
                {v.isBase && <BaseTag />}
                {!!p.jobId && v.jobIds.includes(p.jobId) && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 500, color: C.indigoInk }}>Made for this job</span>}
              </button>
            )
          })}
          {versions.length === 0 && <p style={{ margin: 0, padding: '6px 8px', fontSize: 12, color: C.muted }}>No version matches “{p.verQuery}”.</p>}
        </div>
      )}
    </li>
  )
}

export function profileButtonId(kind: ProfileKind): string {
  return `pf-btn-${kind}`
}

/** Education, Technical Skills, Leadership & Achievements: a checkbox and a secondary Edit button, all alike. */
export function ProfileRow({ kind, checked, onToggle, onEdit, open }: { kind: ProfileKind; checked: boolean; onToggle: () => void; onEdit: () => void; open: boolean }) {
  const name = PROFILE_HEADINGS[kind]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, background: C.well, fontSize: 12.5 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{ width: 15, height: 15, margin: 0, accentColor: C.indigo }} />
        <span style={{ fontWeight: 600 }}>{name}</span>
      </label>
      <button type="button" id={profileButtonId(kind)} className={cls.btnS} onClick={onEdit} aria-expanded={open} aria-haspopup="dialog" style={btnS(26, { marginLeft: 'auto', gap: 5, fontSize: 12 })}>
        <Icon name="pencil" size={12} />
        Edit<span className="sr-only"> {name}</span>
      </button>
    </div>
  )
}

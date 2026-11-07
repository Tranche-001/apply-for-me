'use client'

import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/icons'
import { C, SANS, cls, cvField, iconB } from '@/components/ui/styles'
import type { AchievementItem, EducationItem, ProfileKind, SkillItem } from '../types'
import { addButtonId, itemLabel, profileFieldId, type ProfileStore } from './use-profile-store'

const ADD_LABEL: Record<ProfileKind, string> = { education: 'Add education', skills: 'Add a line', achievements: 'Add an item' }
const EMPTY: Record<ProfileKind, string> = { education: 'No education yet.', skills: 'No skills lines yet.', achievements: 'No items yet.' }

function rows(text: string, perLine: number): number {
  return Math.max(1, Math.ceil((text || '').length / perLine))
}

const area: CSSProperties = { resize: 'none', fieldSizing: 'content' } as CSSProperties

function Controls({ store, kind, id, label, isFirst, isLast }: { store: ProfileStore; kind: ProfileKind; id: string; label: string; isFirst: boolean; isLast: boolean }) {
  const small = iconB(26, { borderRadius: 4, color: C.faint })
  return (
    <span style={{ flex: '0 0 auto', display: 'flex', paddingTop: 1, fontFamily: SANS }}>
      <button id={profileFieldId(kind, 'up', id)} type="button" className={cls.iconB} aria-label={`Move “${label}” up`} onClick={() => store.move(kind, id, -1)} disabled={isFirst} style={small}>
        <Icon name="chevronUp" />
      </button>
      <button id={profileFieldId(kind, 'down', id)} type="button" className={cls.iconB} aria-label={`Move “${label}” down`} onClick={() => store.move(kind, id, 1)} disabled={isLast} style={small}>
        <Icon name="chevronDown" />
      </button>
      <button type="button" className={cls.iconB} aria-label={`Remove “${label}”`} onClick={() => store.remove(kind, id)} style={small}>
        <Icon name="trash" />
      </button>
    </span>
  )
}

function EducationRow({ store, x, i, count }: { store: ProfileStore; x: EducationItem; i: number; count: number }) {
  const id = (f: string) => profileFieldId('education', f, x.id)
  const set = (field: keyof EducationItem) => (ev: { target: { value: string } }) => store.update('education', x.id, field, ev.target.value)
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 10px' }}>
          <label htmlFor={id('degree')} className="sr-only">Entry {i + 1}: degree</label>
          <input id={id('degree')} className={cls.cvIn} value={x.degree} onChange={set('degree')} placeholder="Degree" style={cvField({ flex: '1 1 260px', height: 26, marginLeft: -6, fontSize: 14, fontWeight: 700 })} />
          <label htmlFor={id('dates')} className="sr-only">Entry {i + 1}: dates</label>
          <input id={id('dates')} className={cls.cvIn} value={x.dates} onChange={set('dates')} placeholder="Month Year – Month Year" style={cvField({ flex: '0 1 230px', height: 24, fontSize: 13, textAlign: 'right' })} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0 10px' }}>
          <label htmlFor={id('school')} className="sr-only">Entry {i + 1}: school</label>
          <input id={id('school')} className={cls.cvIn} value={x.school} onChange={set('school')} placeholder="School" style={cvField({ flex: '1 1 260px', height: 24, marginLeft: -6, fontSize: 13, fontStyle: 'italic' })} />
          <label htmlFor={id('location')} className="sr-only">Entry {i + 1}: location</label>
          <input id={id('location')} className={cls.cvIn} value={x.location} onChange={set('location')} placeholder="City, State" style={cvField({ flex: '0 1 230px', height: 24, fontSize: 13, fontStyle: 'italic', textAlign: 'right' })} />
        </div>
      </div>
      <Controls store={store} kind="education" id={x.id} label={itemLabel('education', x)} isFirst={i === 0} isLast={i === count - 1} />
    </li>
  )
}

function SkillRow({ store, x, i, count }: { store: ProfileStore; x: SkillItem; i: number; count: number }) {
  const id = (f: string) => profileFieldId('skills', f, x.id)
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <label htmlFor={id('label')} className="sr-only">Line {i + 1}: label</label>
      <input id={id('label')} className={cls.cvIn} value={x.label} onChange={(ev) => store.update('skills', x.id, 'label', ev.target.value)} placeholder="Label" style={cvField({ flex: '0 0 116px', height: 26, marginLeft: -6, fontSize: 13.5, fontWeight: 700 })} />
      <span aria-hidden="true" style={{ flex: '0 0 auto', paddingTop: 3, fontSize: 13.5, fontWeight: 700 }}>:</span>
      <label htmlFor={id('text')} className="sr-only">Line {i + 1}: skills</label>
      <textarea id={id('text')} className={cls.cvIn} rows={rows(x.text, 78)} value={x.text} onChange={(ev) => store.update('skills', x.id, 'text', ev.target.value)} placeholder="Comma-separated, most relevant first" style={cvField({ ...area, flex: '1 1 auto', padding: '3px 6px', fontSize: 13.5, lineHeight: 1.45 })} />
      <Controls store={store} kind="skills" id={x.id} label={itemLabel('skills', x)} isFirst={i === 0} isLast={i === count - 1} />
    </li>
  )
}

function AchievementRow({ store, x, i, count }: { store: ProfileStore; x: AchievementItem; i: number; count: number }) {
  const id = (f: string) => profileFieldId('achievements', f, x.id)
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <label htmlFor={id('title')} className="sr-only">Item {i + 1}: title</label>
        <input id={id('title')} className={cls.cvIn} value={x.title} onChange={(ev) => store.update('achievements', x.id, 'title', ev.target.value)} placeholder="Title" style={cvField({ height: 25, marginLeft: -6, fontSize: 13.5, fontWeight: 700 })} />
        <label htmlFor={id('description')} className="sr-only">Item {i + 1}: description</label>
        <textarea id={id('description')} className={cls.cvIn} rows={rows(x.description, 92)} value={x.description} onChange={(ev) => store.update('achievements', x.id, 'description', ev.target.value)} placeholder="One line on what it shows" style={cvField({ ...area, marginLeft: -6, padding: '1px 6px', fontSize: 13, fontStyle: 'italic', lineHeight: 1.45 })} />
      </div>
      <Controls store={store} kind="achievements" id={x.id} label={itemLabel('achievements', x)} isFirst={i === 0} isLast={i === count - 1} />
    </li>
  )
}

/** One profile section edited "like the CV": the same editor on the Profile page and in Compose (H4). */
export function ProfileSectionEditor({ store, kind, showAdd = true }: { store: ProfileStore; kind: ProfileKind; showAdd?: boolean }) {
  const p = store.profile
  const count = p[kind].length
  const gap = kind === 'education' ? 10 : kind === 'skills' ? 4 : 8
  return (
    <>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap }}>
        {kind === 'education' && p.education.map((x, i) => <EducationRow key={x.id} store={store} x={x} i={i} count={count} />)}
        {kind === 'skills' && p.skills.map((x, i) => <SkillRow key={x.id} store={store} x={x} i={i} count={count} />)}
        {kind === 'achievements' && p.achievements.map((x, i) => <AchievementRow key={x.id} store={store} x={x} i={i} count={count} />)}
      </ul>
      {count === 0 && <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic', color: '#6B7180' }}>{EMPTY[kind]}</p>}
      {showAdd && (
        <div style={{ fontFamily: SANS }}>
          <AddButton store={store} kind={kind} />
        </div>
      )}
    </>
  )
}

export function AddButton({ store, kind }: { store: ProfileStore; kind: ProfileKind }) {
  return (
    <button
      id={addButtonId(kind)}
      type="button"
      className={cls.addB}
      onClick={() => void store.add(kind)}
      style={{ height: 28, display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: -6, padding: '0 8px', border: 0, borderRadius: 6, background: 'transparent', fontSize: 12.5, fontWeight: 500, color: C.indigo }}
    >
      <Icon name="plus" size={13} />
      {ADD_LABEL[kind]}
    </button>
  )
}

/** The dark "Removed “…”. Undo" strip (H3). */
export function UndoToast({ store, floating = false }: { store: ProfileStore; floating?: boolean }) {
  if (!store.undo) return null
  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: floating ? 12 : 8,
        padding: floating ? '6px 6px 6px 14px' : '4px 6px 4px 10px',
        marginTop: floating ? 12 : 0,
        borderRadius: floating ? 8 : 6,
        background: C.text,
        color: '#FFFFFF',
        fontFamily: SANS,
        fontSize: floating ? 12.5 : 12,
        boxShadow: floating ? '0 8px 24px rgba(20, 22, 27, 0.25)' : undefined,
      }}
    >
      <span style={{ flex: '1 1 auto', minWidth: 0 }}>Removed “{store.undo.label}”.</span>
      <button type="button" onClick={() => void store.undoRemove()} style={{ height: 28, padding: '0 10px', border: 0, borderRadius: 6, background: '#2A2E37', color: C.indigoLine, fontSize: 12.5, fontWeight: 600 }}>
        Undo
      </button>
    </div>
  )
}

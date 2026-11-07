'use client'

import type { Section } from '@prisma/client'
import { C, cls, cvField } from '@/components/ui/styles'
import { SECTION_NAMES } from '@/features/cv/layout'

export type NewBlockMeta = { name: string; section: Section; org: string; location: string; dates: string; stack: string }

export const EMPTY_BLOCK_META: NewBlockMeta = { name: '', section: 'EXPERIENCE', org: '', location: '', dates: '', stack: '' }

export const NEW_BLOCK_NAME_ID = 'ed-bname'

const box = { height: 28, boxSizing: 'border-box' as const, border: `1px solid ${C.borderStrong}`, borderRadius: 6, fontSize: 12.5, background: '#FFFFFF' }

/** Dialog header in new-block mode: the block's name and its section. */
export function NewBlockHeader({ meta, onChange }: { meta: NewBlockMeta; onChange: (m: NewBlockMeta) => void }) {
  return (
    <>
      <h2 id="ed-h" style={{ margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
        New block
      </h2>
      <label htmlFor={NEW_BLOCK_NAME_ID} className="sr-only">Name of the block</label>
      <input id={NEW_BLOCK_NAME_ID} className={cls.field} value={meta.name} onChange={(ev) => onChange({ ...meta, name: ev.target.value })} placeholder="Name, e.g. Visio AI" style={{ ...box, width: 200, padding: '0 8px' }} />
      <label htmlFor="ed-sec" className="sr-only">Section</label>
      <select id="ed-sec" value={meta.section} onChange={(ev) => onChange({ ...meta, section: ev.target.value as Section })} style={{ ...box, padding: '0 6px' }}>
        <option value="EXPERIENCE">{SECTION_NAMES.EXPERIENCE}</option>
        <option value="PROJECT">{SECTION_NAMES.PROJECT}</option>
      </select>
    </>
  )
}

/** Under the title: organization · place · dates for an experience, or the stack of a project. */
export function NewBlockMetaFields({ meta, onChange }: { meta: NewBlockMeta; onChange: (m: NewBlockMeta) => void }) {
  const set = (field: keyof NewBlockMeta) => (ev: { target: { value: string } }) => onChange({ ...meta, [field]: ev.target.value })
  if (meta.section === 'PROJECT') {
    return (
      <>
        <label htmlFor="ed-stack" className="sr-only">Stack</label>
        <input id="ed-stack" className={cls.cvIn} value={meta.stack} onChange={set('stack')} placeholder="Stack, e.g. React, Python, Docker" style={cvField({ height: 24, marginLeft: -6, fontSize: 12.5, fontStyle: 'italic' })} />
      </>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px' }}>
      <label htmlFor="ed-org" className="sr-only">Organization</label>
      <input id="ed-org" className={cls.cvIn} value={meta.org} onChange={set('org')} placeholder="Organization" style={cvField({ flex: '1 1 200px', height: 24, marginLeft: -6, fontSize: 12.5, fontStyle: 'italic' })} />
      <label htmlFor="ed-loc" className="sr-only">Location</label>
      <input id="ed-loc" className={cls.cvIn} value={meta.location} onChange={set('location')} placeholder="City, State" style={cvField({ flex: '0 1 150px', height: 24, fontSize: 12.5, fontStyle: 'italic' })} />
      <label htmlFor="ed-date" className="sr-only">Dates</label>
      <input id="ed-date" className={cls.cvIn} value={meta.dates} onChange={set('dates')} placeholder="Month Year – Present" style={cvField({ flex: '0 1 200px', height: 24, fontSize: 12.5, textAlign: 'right' })} />
    </div>
  )
}

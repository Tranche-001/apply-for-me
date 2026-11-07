'use client'

import { Icon } from '@/components/ui/icons'
import { C, btnS, cls, searchInput } from '@/components/ui/styles'
import { blockContext } from '@/features/blocks/bullets'
import { blockMatches } from '@/features/blocks/library'
import type { LibBlock } from '@/features/blocks/types'
import { blockIdsIn, versionForJob, type Composition } from '../composition'
import { SECTION_NAMES } from '../layout'

type Props = {
  library: LibBlock[]
  comp: Composition
  jobId: string | null
  query: string
  onQuery: (q: string) => void
  onAdd: (block: LibBlock) => void
  onNewBlock: () => void
}

export const NEW_BLOCK_BUTTON_ID = 'new-block-btn'

/** The library blocks not in this CV yet; adding one picks the version made for this job, if any (P3). */
export function AddBlocks({ library, comp, jobId, query, onQuery, onAdd, onNewBlock }: Props) {
  const inCv = blockIdsIn(comp)
  const remaining = library.filter((b) => !inCv.has(b.id) && b.versions.length)
  const rows = remaining.filter((b) => blockMatches(b, query))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Add blocks</h2>
        <button type="button" id={NEW_BLOCK_BUTTON_ID} className={cls.btnS} onClick={onNewBlock} style={btnS(28, { gap: 4, fontSize: 12 })}>
          <Icon name="plus" size={13} />
          New block
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 10, top: 9, color: C.faint, display: 'flex' }}>
          <Icon name="search" />
        </span>
        <input type="search" aria-label="Search your blocks" className={cls.field} value={query} onChange={(ev) => onQuery(ev.target.value)} placeholder="Search by title, company or theme" style={searchInput} />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((b) => {
          const forJob = versionForJob(b, jobId)
          return (
            <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 10px', borderRadius: 8, border: `1px dashed ${C.borderStrong}` }}>
              <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, ...(forJob ? { color: C.indigoInk, fontWeight: 500 } : { color: C.muted }) }}>
                  {forJob ? `Adds “${forJob.name}”, the version made for this job` : blockContext(b)}
                </span>
              </div>
              <button type="button" className={cls.btnS} onClick={() => onAdd(b)} aria-label={`Add ${b.name} to ${SECTION_NAMES[comp.order.includes(b.section) ? b.section : comp.order[0]]}`} style={btnS(28, { flex: '0 0 auto', gap: 4, borderRadius: 7, fontSize: 12, fontWeight: 600 })}>
                <Icon name="plus" size={13} />
                Add
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length === 0 && <p style={{ margin: 0, padding: '6px 2px', fontSize: 12, color: C.muted }}>{remaining.length === 0 ? 'Every block in your library is in this CV.' : `No block matches “${query}”.`}</p>}
    </div>
  )
}

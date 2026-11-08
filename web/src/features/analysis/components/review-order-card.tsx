'use client'

// "Experience & projects" on review (prototype next-ideas.html #order and #move): the CV's blocks in print order.
// Drag a whole row, or focus it and use ↑/↓ (announced); Swap trades a block for one that is Left out; "Move to …"
// puts a block in the other section of this CV. Nothing here changes the library.
import type { Section } from '@prisma/client'
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { SwapMenu, type SwapItem } from './swap-menu'
import { c } from './ui/cx'
import { useRowDrag } from './use-row-drag'

export type OrderRow = {
  blockId: string
  key: string
  name: string
  /** "Project · 2026 · 2 requirements" */
  sub: string
  swappedIn: boolean
  /** The section "Move to …" puts it in; null with one section. */
  moveTo: Section | null
}
/** A CV section (two sections), or every block (one section, `heading` null). */
export type OrderGroup = { id: string; heading: string | null; rows: OrderRow[] }

export type Props = {
  groups: OrderGroup[]
  /** "Order suggested by the AI", "Your order"… */
  status: string
  canReset: boolean
  disabled: boolean
  choicesFor: (key: string) => SwapItem[]
  onMoveBy: (blockId: string, delta: number) => void
  onMoveTo: (fromId: string, toId: string) => void
  onSwap: (key: string, choiceKey: string) => void
  onSection: (key: string, section: Section) => void
  onReset: () => void
}

const MOVE_LABEL: Record<Section, string> = { EXPERIENCE: 'Move to Experience', PROJECT: 'Move to Projects' }

export function ReviewOrderCard({ groups, status, canReset, disabled, choicesFor, onMoveBy, onMoveTo, onSwap, onSection, onReset }: Props) {
  const all = groups.flatMap((g) => g.rows)
  const [said, setSaid] = useState('')
  const [moved, setMoved] = useState<string | null>(null)
  /** After a move or a swap, the row to focus and what to announce once it is drawn in its new place. */
  const after = useRef<{ key: string; say: (pos: number, of: number) => string } | null>(null)
  const list = useRef<HTMLDivElement>(null)
  /** What is drawn: each section and its rows, in order. */
  const drawn = groups.map((g) => `${g.id}:${g.rows.map((r) => r.key).join(',')}`).join('|')

  useLayoutEffect(() => {
    const next = after.current
    if (!next) return
    after.current = null
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-key]') ?? [])]
    const at = rows.findIndex((r) => r.dataset.key === next.key)
    if (at < 0) return
    rows[at].focus({ preventScroll: true })
    setSaid(next.say(at + 1, rows.length))
  }, [drawn])

  const nameOf = (key: string) => all.find((r) => r.key === key)?.name ?? ''
  const placed = (key: string) => (pos: number, of: number) => `${nameOf(key)}, ${pos} of ${of}.`

  const drag = useRowDrag({
    onMoveTo,
    drawn,
    onDrop: (id, didMove) => {
      const row = all.find((r) => r.blockId === id)
      if (!row || !didMove) return
      setMoved(row.key)
      setSaid(`${row.name} moved to position ${all.indexOf(row) + 1} of ${all.length}.`)
    },
  })

  const onKey = (e: KeyboardEvent<HTMLElement>, row: OrderRow, group: OrderGroup) => {
    if (e.target !== e.currentTarget || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const delta = e.key === 'ArrowUp' ? -1 : 1
    const at = group.rows.indexOf(row) + delta
    if (at < 0 || at >= group.rows.length) {
      const where = group.heading ? ` of ${group.heading}` : ''
      setSaid(`${row.name} is already ${delta < 0 ? 'first' : 'last'}${where}.`)
      return
    }
    setMoved(row.key)
    after.current = { key: row.key, say: placed(row.key) }
    onMoveBy(row.blockId, delta)
  }

  const swap = (row: OrderRow, choiceKey: string) => {
    const name = choicesFor(row.key).find((x) => x.key === choiceKey)?.name ?? ''
    setMoved(choiceKey)
    after.current = { key: choiceKey, say: (pos) => `${name} is in place of ${row.name}, at ${pos}. ${row.name} is left out.` }
    onSwap(row.key, choiceKey)
  }

  const toSection = (row: OrderRow, section: Section) => {
    after.current = { key: row.key, say: () => `${row.name} is in ${section === 'EXPERIENCE' ? 'Experience' : 'Projects'} on this CV.` }
    onSection(row.key, section)
  }

  /** Numbers run through the whole CV, not per section. */
  const firstOf = (index: number) => groups.slice(0, index).reduce((sum, g) => sum + g.rows.length, 0)
  return (
    <section className={c('tt-card')} aria-labelledby="ord-head">
      <div className={c('ord-head')}>
        <h4 id="ord-head">Experience &amp; projects</h4>
        <span className={c('ord-state')}>{status}</span>
      </div>
      <div ref={list} className={c('ord-groups')}>
        {groups.map((group, gi) => (
          <div key={group.id}>
            {group.heading && <p className={c('ord-cap')}>{group.heading}</p>}
            <ol className={c('ord')} data-group={group.id}>
              {group.rows.map((row, ri) => {
                const n = firstOf(gi) + ri + 1
                return (
                  <li
                    key={row.key}
                    data-row={row.blockId}
                    data-key={row.key}
                    tabIndex={disabled ? -1 : 0}
                    aria-label={`${n}. ${row.name}${row.swappedIn ? ', swapped in' : ''}. ${disabled ? '' : 'Drag, or use the arrow keys to move.'}`}
                    className={c('ord-it', drag.dragging === row.blockId && 'drag', moved === row.key && 'moved', disabled && 'off')}
                    onPointerDown={disabled ? undefined : (e) => drag.onPointerDown(e, row.blockId)}
                    onKeyDown={disabled ? undefined : (e) => onKey(e, row, group)}
                  >
                    <span className={c('ord-n')} aria-hidden="true">
                      {n}
                    </span>
                    <span className={c('ord-t')}>
                      {row.name}
                      {row.swappedIn && <span className={c('ord-tag')}>Swapped in</span>}
                      <small>{row.sub}</small>
                    </span>
                    <SwapMenu name={row.name} items={choicesFor(row.key)} disabled={disabled} onPick={(key) => swap(row, key)} />
                    {row.moveTo ? (
                      <button type="button" className={c('a-btn sm')} disabled={disabled} onClick={() => toSection(row, row.moveTo as Section)}>
                        {MOVE_LABEL[row.moveTo]}
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <button type="button" className={c('ord-reset')} disabled={disabled || !canReset} onClick={onReset}>
        Back to the AI’s order
      </button>
    </section>
  )
}

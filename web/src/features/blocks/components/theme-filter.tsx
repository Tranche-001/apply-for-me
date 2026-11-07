'use client'

import { useRef, useState } from 'react'
import { useOutsideClose } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icons'
import { C, MONO, cls, popover, segment } from '@/components/ui/styles'
import type { ThemeMode } from '../library'

type Props = {
  counts: { theme: string; count: number }[]
  selected: string[]
  mode: ThemeMode
  onToggle: (theme: string) => void
  onMode: (mode: ThemeMode) => void
  onClear: () => void
}

/** One "Themes" button opening a multi-select picker (decision log 2026-11-05). */
export function ThemeFilter({ counts, selected, mode, onToggle, onMode, onClear }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useOutsideClose(open, [box], () => setOpen(false))
  const q = query.trim().toLowerCase()
  const options = counts.filter((c) => !q || c.theme.toLowerCase().includes(q))
  return (
    <div ref={box} style={{ position: 'relative', flex: '0 0 auto' }}>
      <button
        type="button"
        className={cls.btnS}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="theme-pop"
        style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: '#FFFFFF', fontSize: 13.5, fontWeight: 500, color: C.ink }}
      >
        <Icon name="filter" size={16} />
        Themes
        {selected.length > 0 && (
          <span style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, background: C.indigo, color: '#FFFFFF', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{selected.length}</span>
        )}
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div
          id="theme-pop"
          role="dialog"
          aria-label="Filter by theme"
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') setOpen(false)
          }}
          style={{ ...popover, position: 'absolute', zIndex: 20, top: 'calc(100% + 6px)', right: 0, width: 320, maxWidth: 'calc(100vw - 32px)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <label htmlFor="theme-q" className="sr-only">Find a theme</label>
          <input id="theme-q" type="search" className={cls.field} autoFocus value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Find a theme" style={{ minHeight: 36, boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontSize: 13.5 }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span id="match-l" style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>Show versions that have</span>
            <div role="group" aria-labelledby="match-l" style={{ display: 'flex', padding: 3, gap: 3, borderRadius: 8, background: '#F1F2F4' }}>
              <button type="button" onClick={() => onMode('any')} aria-pressed={mode === 'any'} style={segment(mode === 'any', { height: 28, padding: '0 12px' })}>Any</button>
              <button type="button" onClick={() => onMode('all')} aria-pressed={mode === 'all'} style={segment(mode === 'all', { height: 28, padding: '0 12px' })}>All</button>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', margin: '0 -4px', display: 'flex', flexDirection: 'column' }}>
            {options.map((o) => (
              <label key={o.theme} className={cls.opt} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 38, padding: '0 8px', borderRadius: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(o.theme)} onChange={() => onToggle(o.theme)} style={{ width: 16, height: 16, margin: 0, accentColor: C.indigo }} />
                <span style={{ flex: '1 1 auto', fontSize: 13.5 }}>{o.theme}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{o.count}</span>
              </label>
            ))}
            {options.length === 0 && <p style={{ margin: 0, padding: '10px 8px', fontSize: 13, lineHeight: 1.5, color: C.muted }}>No theme matches “{query}”. Versions get themes when they are written.</p>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: `1px solid ${C.hairline}` }}>
            <button type="button" onClick={onClear} disabled={!selected.length} style={{ minHeight: 36, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', color: C.indigo, fontSize: 13, fontWeight: 500 }}>Clear</button>
            <button type="button" className={cls.btnP} onClick={() => setOpen(false)} style={{ minHeight: 36, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.indigo}`, background: C.indigo, color: '#FFFFFF', fontSize: 13, fontWeight: 600 }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, type DragEvent } from 'react'
import { Icon } from '@/components/ui/icons'
import { C, cls } from '@/components/ui/styles'
import { mergeVersion, reorderBlocks } from '../actions'
import { EMPTY_OVERLAY, applyOverlay, themeCounts, versionMatches, withVersions, type LibraryOverlay, type ThemeMode } from '../library'
import type { LibBlock } from '../types'
import { BlockCard } from './block-card'
import { LibraryEditor, editVersion, newBlockEditing, type JobOption, type LibEditing } from './library-editor'
import { ThemeFilter } from './theme-filter'

type Props = { library: LibBlock[]; jobs: JobOption[] }

/** The block library: one card per experience with its versions (Main.dc.html). */
export function LibraryView({ library, jobs }: Props) {
  const [overlay, setOverlay] = useState<LibraryOverlay>(EMPTY_OVERLAY)
  const [query, setQuery] = useState('')
  const [themes, setThemes] = useState<string[]>([])
  const [mode, setMode] = useState<ThemeMode>('any')
  const [verOpen, setVerOpen] = useState<string | null>(null)
  const [active, setActive] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<LibEditing | null>(null)
  const [drag, setDrag] = useState<{ id: string | null; over: string | null }>({ id: null, over: null })
  const [notice, setNotice] = useState<string | null>(null)

  const lib = applyOverlay(library, overlay)
  const jobLabels = Object.fromEntries(jobs.map((j) => [j.id, j.label]))
  const filter = { query, themes, mode, jobLabels }
  const filtering = themes.length > 0 || !!query.trim()
  const visible = lib.filter((b) => b.versions.some((v) => versionMatches(b, v, filter)))
  const allVersions = lib.flatMap((b) => b.versions)
  const gapBlocks = lib.filter((b) => b.versions.some((v) => v.bullets.some((x) => x.kind === 'MISSING')))
  const firstGap = gapBlocks[0]?.versions.flatMap((v) => v.bullets).find((x) => x.kind === 'MISSING')

  const resetActive = () => setActive({})

  function persistOrder(ids: string[]) {
    setOverlay((o) => ({ ...o, order: ids }))
    void reorderBlocks({ ids }).then((r) => setNotice(r.ok ? null : r.error))
  }

  function moveBy(id: string, dir: -1 | 1) {
    const ids = visible.map((b) => b.id)
    const neighbor = ids[ids.indexOf(id) + dir]
    if (!neighbor) return
    const all = lib.map((b) => b.id)
    persistOrder(all.map((x) => (x === id ? neighbor : x === neighbor ? id : x)))
  }

  function moveTo(fromId: string, toId: string) {
    const all = lib.map((b) => b.id).filter((x) => x !== fromId)
    const at = all.indexOf(toId) + (lib.findIndex((b) => b.id === fromId) < lib.findIndex((b) => b.id === toId) ? 1 : 0)
    persistOrder([...all.slice(0, at), fromId, ...all.slice(at)])
  }

  async function merge(blockId: string, fromId: string, intoId: string) {
    const res = await mergeVersion({ fromId, intoId })
    if (!res.ok) {
      setNotice(res.error)
      return
    }
    setOverlay((o) => ({ ...o, removed: [...o.removed, fromId] }))
    setActive((a) => (a[blockId] === fromId ? { ...a, [blockId]: intoId } : a))
    setNotice(null)
  }

  const resultLine = `Showing ${visible.length} of ${lib.length} blocks`

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '18px 14px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p className="eyebrow" style={{ fontSize: 12 }}>LIBRARY</p>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>Your blocks</h1>
          <p style={{ margin: 0, maxWidth: 660, fontSize: 14, lineHeight: 1.5, color: C.muted }}>
            One card per experience, each with versions: a different title, different bullets, or both. Duplicate a version to tweak it and link it to a job. Drag cards, or use the arrows, to reorder.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" disabled title="Importing from LaTeX isn’t built yet" style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.borderStrong}`, background: '#FFFFFF', fontSize: 14, fontWeight: 500, color: C.ink }}>
            <Icon name="upload" size={16} />
            Import from LaTeX
          </button>
          <button type="button" className={cls.btnP} onClick={() => setEditing(newBlockEditing())} style={{ minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 16px', borderRadius: 8, border: `1px solid ${C.indigo}`, background: C.indigo, color: '#FFFFFF', fontSize: 14, fontWeight: 600 }}>
            <Icon name="plus" size={16} />
            New block
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label htmlFor="lib-search" className="sr-only">Search by title, company or job</label>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, boxSizing: 'border-box', padding: '0 12px', background: '#FFFFFF', border: `1px solid ${C.borderStrong}`, borderRadius: 10, color: C.muted }}>
          <Icon name="search" size={17} />
          <input
            id="lib-search"
            type="search"
            className={cls.field}
            value={query}
            onChange={(ev) => {
              setQuery(ev.target.value)
              resetActive()
            }}
            placeholder="Search by title, company or job, e.g. IAAS or ifood"
            style={{ flex: '1 1 auto', minWidth: 0, border: 0, background: 'transparent', fontSize: 14, color: C.text, outlineOffset: 4 }}
          />
        </div>
        <ThemeFilter
          counts={themeCounts(lib)}
          selected={themes}
          mode={mode}
          onToggle={(t) => {
            setThemes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
            resetActive()
          }}
          onMode={(m) => {
            setMode(m)
            resetActive()
          }}
          onClear={() => {
            setThemes([])
            resetActive()
          }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', marginTop: -8 }}>
        {themes.length > 0 && (
          <div role="group" aria-label="Active theme filters" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: C.muted }}>{mode === 'all' ? 'Has all of:' : 'Has any of:'}</span>
            {themes.map((t) => (
              <button key={t} type="button" onClick={() => setThemes((cur) => cur.filter((x) => x !== t))} aria-label={`Remove theme ${t}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 30, padding: '0 6px 0 10px', borderRadius: 999, border: `1px solid ${C.indigoLine}`, background: C.indigoSoft, color: C.indigoInk, fontSize: 13, fontWeight: 500 }}>
                {t}
                <Icon name="close" />
              </button>
            ))}
            <button type="button" onClick={() => setThemes([])} style={{ minHeight: 30, padding: '0 6px', border: 0, background: 'transparent', color: C.indigo, fontSize: 13, fontWeight: 500, textDecoration: 'underline' }}>Clear all</button>
          </div>
        )}
        <p role="status" style={{ margin: 0, fontSize: 13, color: C.muted }}>{resultLine}</p>
        {notice && <p role="alert" style={{ margin: 0, fontSize: 13, color: C.danger }}>{notice}</p>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20 }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.length === 0 && (
            <p style={{ margin: 0, padding: 32, textAlign: 'center', background: '#FFFFFF', border: `1px dashed ${C.borderStrong}`, borderRadius: 12, fontSize: 14, color: C.muted }}>
              {lib.length ? 'No block or version matches that search.' : 'No blocks yet. Add your first one with New block.'}
            </p>
          )}
          <ol aria-label="Blocks" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map((b, i) => {
              const base = b.versions.find((v) => v.isBase) ?? b.versions[0]
              const auto = filtering ? b.versions.find((v) => versionMatches(b, v, filter)) : base
              const shown = b.versions.find((v) => v.id === active[b.id]) ?? auto ?? base
              const busyCard = editing?.mode !== 'new' && editing?.blockId === b.id
              return (
                <BlockCard
                  key={b.id}
                  block={b}
                  index={i}
                  total={visible.length}
                  shown={shown}
                  jobLabels={jobLabels}
                  verOpen={verOpen === b.id}
                  onToggleVersions={() => setVerOpen((o) => (o === b.id ? null : b.id))}
                  onCloseVersions={() => setVerOpen((o) => (o === b.id ? null : o))}
                  onPick={(id) => {
                    setActive((a) => ({ ...a, [b.id]: id }))
                    setVerOpen(null)
                  }}
                  onMerge={(fromId, intoId) => void merge(b.id, fromId, intoId)}
                  onDuplicate={() => {
                    setVerOpen(null)
                    setEditing(editVersion(b, shown, 'copy'))
                  }}
                  onEdit={() => setEditing(editVersion(b, shown, 'edit'))}
                  onMove={(dir) => moveBy(b.id, dir)}
                  drag={{
                    dragging: drag.id === b.id,
                    over: drag.over === b.id && !!drag.id && drag.id !== b.id,
                    draggable: !busyCard && verOpen !== b.id,
                    onDragStart: (ev: DragEvent) => {
                      ev.dataTransfer.effectAllowed = 'move'
                      ev.dataTransfer.setData('text/plain', b.id)
                      setDrag({ id: b.id, over: null })
                    },
                    onDragOver: (ev: DragEvent) => {
                      ev.preventDefault()
                      if (drag.over !== b.id) setDrag((d) => ({ ...d, over: b.id }))
                    },
                    onDrop: (ev: DragEvent) => {
                      ev.preventDefault()
                      const from = drag.id
                      setDrag({ id: null, over: null })
                      if (from && from !== b.id) moveTo(from, b.id)
                    },
                    onDragEnd: () => setDrag({ id: null, over: null }),
                  }}
                />
              )
            })}
          </ol>
        </div>

        <aside aria-label="Library summary" style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Library</h2>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                [lib.length, 'blocks'],
                [allVersions.length, 'versions'],
              ].map(([n, label]) => (
                <div key={label} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
                </div>
              ))}
            </div>
            {gapBlocks.length > 0 && (
              <div style={{ padding: 12, borderRadius: 8, background: C.amberSoft, border: `1px solid ${C.amberLine}` }}>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.amberInk }}>
                  {gapBlocks.length === 1 ? '1 block has' : `${gapBlocks.length} blocks have`} a missing bullet. <strong style={{ fontWeight: 600 }}>{gapBlocks[0].name}</strong> has no {(firstGap?.want ?? 'IMPACT').toLowerCase().replace('_', ' · ')} bullet. Write it in the card’s editor, or leave the gap: it is never printed.
                </p>
              </div>
            )}
          </section>
          <section style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Reuse before creating</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.muted }}>For each new job, the AI first looks for a version that already fits and reuses it. It writes a new version only when none does, so 300 applications stay a handful of versions per block.</p>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: C.muted }}>Jobs are not tags. Each version keeps the list of applications that used it, and the search above finds them.</p>
          </section>
        </aside>
      </div>

      {editing && (
        <LibraryEditor
          editing={editing}
          onChange={setEditing}
          library={lib}
          jobs={jobs}
          onCancel={() => setEditing(null)}
          onDone={(saved) => {
            if (saved.kind === 'block') setOverlay((o) => ({ ...o, blocks: [...o.blocks, saved.block] }))
            if (saved.kind === 'version' || saved.kind === 'linked') {
              setOverlay((o) => withVersions(o, [saved.version]))
              setActive((a) => ({ ...a, [saved.version.blockId]: saved.version.id }))
            }
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

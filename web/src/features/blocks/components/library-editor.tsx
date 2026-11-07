'use client'

import { useState } from 'react'
import { C, cls } from '@/components/ui/styles'
import { findJobByLabel } from '@/features/jobs/links'
import { createBlock, createVersion, linkVersionToJob, updateVersion } from '../actions'
import { blankBullet, blockContext, draftChanged, draftVersion, fromEditorBullets, samePrintedText, toEditorBullets, type EditorDraft } from '../bullets'
import type { LibBlock, LibVersion } from '../types'
import { EditorDialog, EditorMeta, VersionFields, newBulletId } from './block-editor'
import { EMPTY_BLOCK_META, NEW_BLOCK_NAME_ID, NewBlockHeader, NewBlockMetaFields, type NewBlockMeta } from './new-block-fields'

export type LibEditing =
  | { mode: 'edit' | 'copy'; blockId: string; versionId: string; name: string; draft: EditorDraft; jobText: string }
  | { mode: 'new'; meta: NewBlockMeta; draft: EditorDraft; jobText: string }

export type JobOption = { id: string; label: string }

export function editVersion(block: LibBlock, v: LibVersion, mode: 'edit' | 'copy'): LibEditing {
  const draft = { title: v.title, bullets: toEditorBullets(v.bullets, () => newBulletId()) }
  return { mode, blockId: block.id, versionId: v.id, name: mode === 'edit' ? v.name : '', draft: draft.bullets.length ? draft : { ...draft, bullets: [blankBullet(newBulletId(), 'PROJECT')] }, jobText: '' }
}

export function newBlockEditing(): LibEditing {
  return { mode: 'new', meta: EMPTY_BLOCK_META, draft: { title: '', bullets: [blankBullet(newBulletId(), 'PROJECT'), blankBullet(newBulletId(), 'STACK'), blankBullet(newBulletId(), 'IMPACT')] }, jobText: '' }
}

type Saved = { kind: 'version'; version: LibVersion } | { kind: 'block'; block: LibBlock } | { kind: 'linked'; version: LibVersion } | { kind: 'discarded' }

type Props = {
  editing: LibEditing
  onChange: (e: LibEditing) => void
  library: LibBlock[]
  jobs: JobOption[]
  onDone: (saved: Saved) => void
  onCancel: () => void
}

/** The library's edit dialog: the same "like the CV" editor as Compose, with a version name and a job link. */
export function LibraryEditor({ editing, onChange, library, jobs, onDone, onCancel }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const block = editing.mode === 'new' ? null : library.find((b) => b.id === editing.blockId) ?? null
  const source = editing.mode === 'new' || !block ? null : block.versions.find((v) => v.id === editing.versionId) ?? null
  const job = editing.jobText.trim() ? findJobByLabel(jobs, editing.jobText) : null
  const jobUnknown = !!editing.jobText.trim() && !job

  if (editing.mode !== 'new' && (!block || !source)) return null

  const printed = source ? draftVersion(source, editing.draft, block?.name ?? '') : null
  const identical = editing.mode === 'copy' && !!source && !!printed && samePrintedText(printed, source)
  const changed =
    editing.mode === 'new'
      ? !!editing.meta.name.trim() && !!editing.draft.title.trim()
      : editing.mode === 'copy' || (!!source && (draftChanged(source, editing.draft) || editing.name.trim() !== source.name || !!job))

  async function save() {
    if (busy || jobUnknown) return
    setBusy(true)
    setError(null)
    const bullets = fromEditorBullets(editing.draft.bullets)
    const jobId = job?.id ?? null
    let result: Saved | null = null
    if (editing.mode === 'new') {
      const res = await createBlock({ ...editing.meta, title: editing.draft.title, bullets, jobId })
      if (res.ok) result = { kind: 'block', block: res.data }
      else setError(res.error)
    } else if (editing.mode === 'copy') {
      const res = await createVersion({ blockId: editing.blockId, sourceVersionId: editing.versionId, name: editing.name, title: printed?.title ?? editing.draft.title, bullets, jobId })
      if (res.ok) result = { kind: 'version', version: res.data }
      else setError(res.error)
    } else {
      const res = await updateVersion({ versionId: editing.versionId, name: editing.name, title: printed?.title ?? editing.draft.title, bullets, linkJobId: jobId })
      if (res.ok) result = { kind: 'version', version: res.data }
      else setError(res.error)
    }
    setBusy(false)
    if (result) onDone(result)
  }

  async function keepSource() {
    if (!source) return
    if (!job) {
      onDone({ kind: 'discarded' })
      return
    }
    setBusy(true)
    const res = await linkVersionToJob({ versionId: source.id, jobId: job.id })
    setBusy(false)
    if (res.ok) onDone({ kind: 'linked', version: res.data })
    else setError(res.error)
  }

  const header =
    editing.mode === 'new' ? (
      <NewBlockHeader meta={editing.meta} onChange={(meta) => onChange({ ...editing, meta })} />
    ) : (
      <>
        <h2 id="ed-h" style={{ margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {editing.mode === 'copy' ? 'New version' : 'Edit version'}
        </h2>
        <label htmlFor="ed-name" style={{ fontSize: 11, color: C.muted }}>Name</label>
        <input
          id="ed-name"
          className={cls.field}
          value={editing.name}
          onChange={(ev) => onChange({ ...editing, name: ev.target.value })}
          placeholder={editing.mode === 'copy' ? 'Empty: takes the job’s name' : 'e.g. Full-Stack Engineer'}
          style={{ width: 200, height: 28, boxSizing: 'border-box', padding: '0 8px', border: `1px solid ${C.borderStrong}`, borderRadius: 6, fontSize: 12.5 }}
        />
      </>
    )

  const meta = editing.mode === 'new' ? <NewBlockMetaFields meta={editing.meta} onChange={(m) => onChange({ ...editing, meta: m })} /> : block ? <EditorMeta text={blockContext(block)} /> : null
  const sourceName = source?.name || 'Untitled version'

  return (
    <EditorDialog
      labelledBy="ed-h"
      maxWidth={880}
      header={header}
      status={jobUnknown ? <span style={{ color: C.amber }}>No job is called “{editing.jobText.trim()}”. Pick one from the list.</span> : <span style={{ fontSize: 11, color: C.muted }}>Lines break about where they will on the page · empty bullets are dropped</span>}
      saveLabel={editing.mode === 'new' ? 'Add block' : 'Save version'}
      saveDisabled={!changed || jobUnknown}
      busy={busy}
      error={error}
      onSave={() => void save()}
      onCancel={onCancel}
      footerStart={
        <>
          <label htmlFor="ed-job" className="sr-only">Link to a job</label>
          <input
            id="ed-job"
            list="lib-job-options"
            className={cls.field}
            value={editing.jobText}
            onChange={(ev) => onChange({ ...editing, jobText: ev.target.value })}
            placeholder="Link to a job (optional)"
            style={{ width: 260, height: 30, boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${jobUnknown ? C.amberButton : C.borderStrong}`, borderRadius: 6, fontSize: 12.5 }}
          />
          <datalist id="lib-job-options">
            {jobs.map((j) => (
              <option key={j.id} value={j.label} />
            ))}
          </datalist>
        </>
      }
      extra={
        identical ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', margin: '4px 16px 0', padding: '6px 10px', borderRadius: 6, background: C.amberSoft, border: `1px solid ${C.amberLine}` }}>
            <p style={{ flex: '1 1 240px', margin: 0, fontSize: 12, lineHeight: 1.4, color: C.amberInk }}>No changes yet. This copy is identical to “{sourceName}”.</p>
            <button type="button" className={cls.btnS} onClick={() => void keepSource()} disabled={busy} style={{ height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${C.amberButton}`, background: '#FFFFFF', color: C.amber, fontSize: 12, fontWeight: 600 }}>
              {job ? `Link the job to “${sourceName}” instead` : 'Discard this copy'}
            </button>
          </div>
        ) : null
      }
    >
      <VersionFields
        draft={editing.draft}
        onChange={(draft) => onChange({ ...editing, draft })}
        meta={meta}
        titlePlaceholder={editing.mode === 'new' ? (editing.meta.section === 'PROJECT' ? 'Project name' : 'Role — Organization') : ''}
        initialFocusId={editing.mode === 'new' ? NEW_BLOCK_NAME_ID : editing.mode === 'copy' ? 'ed-name' : undefined}
      />
    </EditorDialog>
  )
}

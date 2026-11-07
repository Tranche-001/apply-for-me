'use client'

import { C } from '@/components/ui/styles'
import { EditorDialog, EditorMeta, SaveAsCard, VersionFields } from '@/features/blocks/components/block-editor'
import { NEW_BLOCK_NAME_ID, NewBlockHeader, NewBlockMetaFields, type NewBlockMeta } from '@/features/blocks/components/new-block-fields'
import { blockContext, type EditorDraft } from '@/features/blocks/bullets'
import type { LibBlock, LibVersion } from '@/features/blocks/types'
import type { JobData } from '@/features/jobs/types'

export type ComposeEditing =
  | { kind: 'edit'; blockId: string; versionId: string; draft: EditorDraft; saveAs: 'new' | 'update' }
  | { kind: 'new'; meta: NewBlockMeta; draft: EditorDraft; focusTitle: boolean }

type Props = {
  editing: ComposeEditing
  onChange: (e: ComposeEditing) => void
  block: LibBlock | null
  version: LibVersion | null
  job: JobData | null
  status: { text: string; warn: boolean }
  canSave: boolean
  busy: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
}

/**
 * Edit a block without leaving Compose (decision log): the page follows as you type, and you save it as a
 * new version for this job (named after the job) or update it everywhere. A gap left empty stays a gap.
 */
export function ComposeEditor({ editing, onChange, block, version, job, status, canSave, busy, error, onSave, onCancel }: Props) {
  if (editing.kind === 'new') {
    const meta = editing.meta
    return (
      <EditorDialog
        labelledBy="ed-h"
        header={<NewBlockHeader meta={meta} onChange={(m) => onChange({ ...editing, meta: m })} />}
        status={<span style={{ color: status.warn ? C.amber : C.muted, fontWeight: status.warn ? 500 : 400 }}>{status.text}</span>}
        saveLabel="Add block"
        saveDisabled={!canSave}
        busy={busy}
        error={error}
        onSave={onSave}
        onCancel={onCancel}
      >
        <VersionFields
          draft={editing.draft}
          onChange={(draft) => onChange({ ...editing, draft })}
          meta={<NewBlockMetaFields meta={meta} onChange={(m) => onChange({ ...editing, meta: m })} />}
          titlePlaceholder={meta.section === 'PROJECT' ? 'Project name' : 'Role — Organization'}
          initialFocusId={editing.focusTitle ? undefined : NEW_BLOCK_NAME_ID}
        />
      </EditorDialog>
    )
  }

  if (!block || !version) return null
  const verName = version.name || 'Untitled version'
  const isNew = editing.saveAs === 'new'
  return (
    <EditorDialog
      labelledBy="ed-h"
      header={
        <>
          <h2 id="ed-h" style={{ margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
            Edit {block.name}
          </h2>
          <span style={{ fontSize: 12, color: C.muted }}>version “{verName}”</span>
        </>
      }
      status={<span style={{ color: status.warn ? C.amber : C.muted, fontWeight: status.warn ? 500 : 400 }}>{status.text}</span>}
      saveLabel={isNew ? 'Save new version' : 'Update version'}
      saveDisabled={!canSave}
      busy={busy}
      error={error}
      onSave={onSave}
      onCancel={onCancel}
      extra={
        <div role="radiogroup" aria-labelledby="ed-saveas" style={{ margin: '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span id="ed-saveas" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.02em', color: C.muted }}>Save as</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {job ? (
              <SaveAsCard name="ed-mode" checked={isNew} onSelect={() => onChange({ ...editing, saveAs: 'new' })} label="A new version for this job">
                <span>Named “{job.label}”</span> ·{' '}
                <a href={`/analyze?job=${encodeURIComponent(job.id)}`} target="_blank" rel="noopener noreferrer" aria-label={`Open the job ${job.label} in a new tab`} onClick={(ev) => ev.stopPropagation()} style={{ fontWeight: 500 }}>
                  Open job ↗
                </a>
              </SaveAsCard>
            ) : (
              <SaveAsCard name="ed-mode" checked={false} onSelect={() => undefined} label="A new version for this job">
                Pick or create a job first, in “For job” above.
              </SaveAsCard>
            )}
            <SaveAsCard name="ed-mode" checked={!isNew} onSelect={() => onChange({ ...editing, saveAs: 'update' })} label={`Update “${verName}”`}>
              Changes it in every CV that uses it
            </SaveAsCard>
          </div>
        </div>
      }
    >
      <VersionFields draft={editing.draft} onChange={(draft) => onChange({ ...editing, draft })} meta={<EditorMeta text={blockContext(block)} />} />
    </EditorDialog>
  )
}

'use client'

// "Blocks from this" + "Draft a block from this": the AI drafts, you keep, edit or discard (P2).
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { draftBlockFromExperience } from '@/features/ai/actions'
import type { DraftVersion } from '@/features/ai/types'
import { bulletsToSave, DraftFields, DraftPreview } from '@/features/ai/ui/draft-fields'
import { NOT_READY } from '@/features/ai/provider'
import { Icon } from '@/features/ai/ui/icon'
import { keepBlockDraft } from '../actions'
import type { ExperienceItem } from '../types'

type DraftState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; draft: DraftVersion; editing: boolean; saveError: string | null }
  | { kind: 'saved'; text: string; blockId: string }

type Props = {
  item: ExperienceItem
  aiReady: boolean
  /** Saves pending notes first, so the AI reads what is on screen. */
  beforeDraft: () => void
  onKept: (block: { id: string; name: string }) => void
}

export function BlockDraftPanel({ item, aiReady, beforeDraft, onKept }: Props) {
  const [state, setState] = useState<DraftState>({ kind: 'idle' })
  const [drafting, startDrafting] = useTransition()
  const [saving, startSaving] = useTransition()
  const empty = !item.notes.trim()

  const draft = () => {
    beforeDraft()
    startDrafting(async () => {
      const res = await draftBlockFromExperience({ experienceId: item.id })
      setState(res.ok ? { kind: 'ready', draft: res.data, editing: false, saveError: null } : { kind: 'error', message: res.error })
    })
  }

  const keep = (d: DraftVersion) => {
    startSaving(async () => {
      const res = await keepBlockDraft({ experienceId: item.id, draft: { ...d, bullets: bulletsToSave(d.bullets) } })
      if (!res.ok) {
        setState({ kind: 'ready', draft: d, editing: false, saveError: res.error })
        return
      }
      const { block, versionName, isNewBlock } = res.data
      if (isNewBlock) onKept(block)
      setState({
        kind: 'saved',
        blockId: block.id,
        text: isNewBlock ? `Saved to your library as a new block, “${block.name}”.` : `Saved to your library as “${versionName}”, a new version of ${block.name}.`,
      })
    })
  }

  const ofLabel = (d: DraftVersion) =>
    d.newBlock ? `New block · ${d.newBlock.section === 'EXPERIENCE' ? 'Experience' : 'Project'}` : `New version of ${item.blocks.find((b) => b.id === d.blockId)?.name ?? 'a block'}`

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--border)] bg-white p-3">
      <h2 className="m-0 text-[13px] font-semibold">Blocks from this</h2>
      {item.blocks.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {item.blocks.map((b) => (
            <li key={b.id} className="flex items-center gap-1.5 text-[12.5px]">
              <Icon name="layers" className="text-[var(--muted)]" />
              <Link href="/blocks" className="font-medium">
                {b.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[12.5px] text-[var(--muted)]">None yet.</p>
      )}

      {state.kind !== 'ready' && (
        <button type="button" className="btn-s justify-center" onClick={draft} disabled={empty || drafting || !aiReady}>
          <Icon name="sparkle" />
          {drafting ? 'Drafting…' : state.kind === 'saved' ? 'Draft another' : 'Draft a block from this'}
        </button>
      )}
      {empty && <p className="m-0 text-[11.5px] leading-[1.4] text-[var(--muted)]">Write something first. The AI only uses what is written here.</p>}
      {!aiReady && <p className="m-0 text-[11.5px] leading-[1.4] text-[var(--amber)]">{NOT_READY}</p>}

      <div role="status" className="flex flex-col gap-2">
        {drafting && <p className="m-0 text-[12px] leading-[1.45] text-[var(--indigo-hover)]">The AI is reading your notes. This takes up to a minute.</p>}
        {state.kind === 'error' && !drafting && (
          <p className="m-0 text-[12px] leading-[1.45] text-[var(--amber)]">
            {state.message}{' '}
            <button type="button" onClick={draft} className="border-0 bg-transparent p-0 font-semibold text-[var(--indigo)] underline">
              Retry
            </button>
          </p>
        )}
        {state.kind === 'saved' && (
          <p className="m-0 text-[12px] leading-[1.45] text-[var(--ok-ink)]">
            {state.text} <Link href="/blocks">Open Blocks</Link>
          </p>
        )}
      </div>

      {state.kind === 'ready' && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--indigo-line)] bg-white p-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded bg-[var(--indigo-soft)] px-1.5 py-px font-mono text-[9.5px] font-semibold tracking-[0.04em] text-[var(--indigo-hover)]">
              DRAFT
            </span>
            <span className="text-[12px] text-[var(--muted)]">{ofLabel(state.draft)}</span>
          </div>
          {state.editing ? (
            <DraftFields
              idPrefix="xd"
              title={state.draft.title}
              bullets={state.draft.bullets}
              onChange={({ title, bullets }) => setState({ ...state, draft: { ...state.draft, title, bullets } })}
            />
          ) : (
            <DraftPreview title={state.draft.title} bullets={state.draft.bullets} />
          )}
          <p className="m-0 text-[11.5px] leading-[1.4] text-[var(--muted)]">
            Only facts from your notes; gaps stay empty. Nothing is saved until you keep it.
          </p>
          {state.saveError && (
            <p role="alert" className="m-0 text-[12px] text-[var(--amber)]">
              {state.saveError}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn-p" disabled={saving} onClick={() => keep(state.draft)}>
              <Icon name="check" size={13} />
              {saving ? 'Saving…' : 'Keep'}
            </button>
            <button type="button" className="btn-s" onClick={() => setState({ ...state, editing: !state.editing })}>
              <Icon name="pencil" size={13} />
              {state.editing ? 'Done editing' : 'Edit'}
            </button>
            <button type="button" className="btn-s" onClick={() => setState({ kind: 'idle' })}>
              <Icon name="x" size={13} />
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

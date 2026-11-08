'use client'

// Experiences: list + search on the left, the notes in the middle, blocks and the AI on the right.
// What you type wins: the screen keeps its own copy and autosaves it a moment after each change.
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { useAutosave } from '@/features/ai/ui/use-autosave'
import { createExperience, deleteExperience, pairExperiencesAndBlocks, updateExperience } from '../actions'
import { pairingDoneMessage, type PairingNeeds } from '../pairing-plan'
import type { ExperienceFields, ExperienceItem } from '../types'
import { BlockDraftPanel } from './block-draft-panel'
import { PairingBanner } from './pairing-banner'
import { ExperienceEditor } from './experience-editor'
import { ExperienceList } from './experience-list'

const sameExperience = (a: ExperienceFields, b: ExperienceFields) => a.id === b.id

function focusSoon(id: string) {
  setTimeout(() => document.getElementById(id)?.focus(), 40)
}

type Props = { initialItems: ExperienceItem[]; initialSelectedId?: string | null; aiReady: boolean; initialNeeds: PairingNeeds }

/** The list after "Make them": what you typed stays (it wins), each experience takes its blocks from the server, new ones join at the end. */
function mergeItems(local: ExperienceItem[], fresh: ExperienceItem[]): ExperienceItem[] {
  const byId = new Map(fresh.map((x) => [x.id, x]))
  const kept = local.map((x) => ({ ...x, blocks: byId.get(x.id)?.blocks ?? x.blocks }))
  const known = new Set(local.map((x) => x.id))
  return [...kept, ...fresh.filter((x) => !known.has(x.id))]
}

export function ExperiencesScreen({ initialItems, initialSelectedId = null, aiReady, initialNeeds }: Props) {
  const [items, setItems] = useState(initialItems)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? initialItems[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, startCreating] = useTransition()
  const autosave = useAutosave(updateExperience, { sameTarget: sameExperience })
  const selected = items.find((x) => x.id === selectedId) ?? null
  const [needs, setNeeds] = useState(initialNeeds)
  const [pairDone, setPairDone] = useState<string | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairing, startPairing] = useTransition()

  const makePairs = () => {
    autosave.flush()
    setPairDone(null)
    setPairError(null)
    startPairing(async () => {
      const res = await pairExperiencesAndBlocks()
      if (!res.ok) {
        setPairError(res.error)
        return
      }
      setItems((all) => mergeItems(all, res.data.items))
      setNeeds(res.data.needs)
      setPairDone(pairingDoneMessage(res.data))
    })
  }

  const change = (patch: Partial<ExperienceFields>) => {
    if (!selected) return
    const next = { ...selected, ...patch }
    setItems((all) => all.map((x) => (x.id === next.id ? next : x)))
    autosave.queue({ id: next.id, title: next.title, where: next.where, when: next.when, notes: next.notes })
  }

  const select = (id: string) => {
    if (id === selectedId) return
    autosave.flush()
    setSelectedId(id)
  }

  const addNew = () => {
    autosave.flush()
    setCreateError(null)
    startCreating(async () => {
      const res = await createExperience()
      if (!res.ok) {
        setCreateError(res.error)
        return
      }
      setItems((all) => [res.data, ...all])
      setSelectedId(res.data.id)
      setQuery('')
      focusSoon('x-title')
    })
  }

  const remove = async (): Promise<string | null> => {
    if (!selected) return null
    autosave.flush()
    const res = await deleteExperience({ id: selected.id })
    if (!res.ok) return res.error
    const index = items.findIndex((x) => x.id === selected.id)
    const rest = items.filter((x) => x.id !== selected.id)
    const next = rest[Math.min(index, rest.length - 1)] ?? null
    setItems(rest)
    setSelectedId(next?.id ?? null)
    focusSoon(next ? `xi-${next.id}` : 'x-new')
    return null
  }

  const addLinkedBlock = (block: { id: string; name: string }) => {
    if (!selected) return
    setItems((all) => all.map((x) => (x.id === selected.id ? { ...x, blocks: [...x.blocks, block] } : x)))
  }

  return (
    <div className="flex flex-col gap-2.5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="eyebrow">EXPERIENCES</p>
            <h1 className="page-title">Everything you did, in your own words</h1>
          </div>
          <p className="m-0 text-[12px] leading-[1.4] text-[var(--muted)]">
            The AI reads these when it drafts blocks and behavioral answers. Nothing here is printed on a CV as is.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {createError && (
            <span role="alert" className="text-[12px] text-[var(--amber)]">
              {createError}
            </span>
          )}
          <button id="x-new" type="button" className="btn-p" onClick={addNew} disabled={creating}>
            <Icon name="plus" />
            {creating ? 'Creating…' : 'New experience'}
          </button>
        </div>
      </header>

      <PairingBanner needs={needs} aiReady={aiReady} running={pairing} done={pairDone} error={pairError} onMake={makePairs} />

      <div className="flex min-h-0 flex-auto flex-wrap items-start gap-3">
        <ExperienceList items={items} selectedId={selectedId} query={query} onQuery={setQuery} onSelect={select} />

        <section
          aria-label="Edit experience"
          className="flex h-[calc(100vh-86px)] min-w-0 flex-[1_1_460px] flex-col gap-3 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-white px-5 pb-3 pt-3.5"
        >
          {selected ? (
            <ExperienceEditor
              key={selected.id}
              item={selected}
              saveStatus={autosave.status}
              saveError={autosave.error}
              onChange={change}
              onDelete={remove}
            />
          ) : (
            <div className="m-auto flex max-w-[340px] flex-col items-center gap-2.5 text-center">
              <p className="m-0 text-[14px] font-semibold">No experiences yet</p>
              <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--muted)]">
                Write about a job, a project or a group you were part of. The AI builds blocks only from what you write.
              </p>
              <button type="button" className="btn-p" onClick={addNew} disabled={creating}>
                New experience
              </button>
            </div>
          )}
        </section>

        <aside aria-label="How the AI uses this" className="flex max-h-[calc(100vh-86px)] min-w-[220px] flex-[0_1_250px] flex-col gap-3 overflow-y-auto">
          {selected && (
            <>
              <BlockDraftPanel key={selected.id} item={selected} aiReady={aiReady} beforeDraft={autosave.flush} onKept={addLinkedBlock} />
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-[var(--border)] bg-white p-3">
                <p className="m-0 text-[12.5px] leading-[1.45]">
                  Also used for <Link href="/behavioral" className="font-medium">Behavioral answers</Link>: your situations and feedback become the
                  stories you tell.
                </p>
              </div>
            </>
          )}
          <div className="flex flex-col gap-1 px-1 py-0.5">
            <h2 className="m-0 text-[12px] font-semibold text-[var(--text-2)]">What helps the AI</h2>
            <p className="m-0 text-[12px] leading-[1.5] text-[var(--muted)]">
              Names of tools, who it was for, numbers, what went wrong and how you fixed it, what someone said about your work. If it isn’t written
              here, the AI asks you instead of guessing.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

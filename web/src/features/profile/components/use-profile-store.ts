'use client'

import { useEffect, useRef, useState } from 'react'
import { focusFirst } from '@/components/ui/dialog'
import type { ActionResult } from '@/features/cv/action-result'
import { addProfileItem, removeProfileItem, reorderProfile, restoreProfileItem, updateProfileItem } from '../actions'
import { PROFILE_FIELDS, type ProfileData, type ProfileKind } from '../types'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type AnyItem = { id: string } & Record<string, string>
type Removed = { kind: ProfileKind; item: AnyItem; index: number; label: string }

const AUTOSAVE_MS = 600
const UNDO_MS = 6000

const NOUN: Record<ProfileKind, string> = { education: 'entry', skills: 'line', achievements: 'item' }

export function profileFieldId(kind: ProfileKind, field: string, id: string): string {
  return `pf-${kind}-${field}-${id}`
}

export function addButtonId(kind: ProfileKind): string {
  return `pf-add-${kind}`
}

/** "Bachelor of …", "Languages", or "Untitled entry" for an empty one. */
export function itemLabel(kind: ProfileKind, item: AnyItem): string {
  const first = PROFILE_FIELDS[kind][0]
  return (item[first] ?? '').trim() || `Untitled ${NOUN[kind]}`
}

function listOf(p: ProfileData, kind: ProfileKind): AnyItem[] {
  return p[kind] as unknown as AnyItem[]
}

function withList(p: ProfileData, kind: ProfileKind, list: AnyItem[]): ProfileData {
  return { ...p, [kind]: list }
}

export type ProfileStore = ReturnType<typeof useProfileStore>

/**
 * Your profile as you edit it. Text fields save themselves a moment after you stop typing; add, remove
 * (with Undo) and reorder save at once. The screen always shows your latest text (H1, H3).
 */
export function useProfileStore(initial: ProfileData) {
  const [profile, setProfile] = useState(initial)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<Removed | null>(null)
  const pending = useRef(new Map<string, { kind: ProfileKind; id: string; values: Record<string, string> }>())
  const timers = useRef(new Map<string, number>())
  const inflight = useRef(0)
  const undoTimer = useRef<number | undefined>(undefined)

  async function run<T>(op: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    inflight.current += 1
    setSaveState('saving')
    const res = await op()
    inflight.current -= 1
    if (!res.ok) {
      setSaveState('error')
      setError(res.error)
    } else if (inflight.current === 0 && pending.current.size === 0) {
      setSaveState('saved')
      setError(null)
    }
    return res
  }

  function flush(key: string) {
    window.clearTimeout(timers.current.get(key))
    timers.current.delete(key)
    const job = pending.current.get(key)
    if (!job) return
    pending.current.delete(key)
    void run(() => updateProfileItem(job))
  }

  function flushAll() {
    for (const key of [...pending.current.keys()]) flush(key)
  }

  // Leaving the screen saves what is still waiting.
  useEffect(() => {
    const current = pending.current
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushAll()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      if (current.size) flushAll()
    }
    // flushAll only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(kind: ProfileKind, id: string, field: string, value: string) {
    setProfile((p) => withList(p, kind, listOf(p, kind).map((x) => (x.id === id ? { ...x, [field]: value } : x))))
    const key = `${kind}:${id}`
    const prev = pending.current.get(key)
    pending.current.set(key, { kind, id, values: { ...(prev?.values ?? {}), [field]: value } })
    window.clearTimeout(timers.current.get(key))
    timers.current.set(key, window.setTimeout(() => flush(key), AUTOSAVE_MS))
    setSaveState('saving')
  }

  async function add(kind: ProfileKind) {
    const res = await run(() => addProfileItem({ kind }))
    if (!res.ok) return
    const item = res.data as unknown as AnyItem
    setProfile((p) => withList(p, kind, [...listOf(p, kind), item]))
    focusFirst([profileFieldId(kind, PROFILE_FIELDS[kind][0], item.id)])
  }

  function remove(kind: ProfileKind, id: string) {
    const list = listOf(profile, kind)
    const index = list.findIndex((x) => x.id === id)
    if (index === -1) return
    const item = list[index]
    const key = `${kind}:${id}`
    window.clearTimeout(timers.current.get(key))
    timers.current.delete(key)
    pending.current.delete(key)
    setProfile((p) => withList(p, kind, listOf(p, kind).filter((x) => x.id !== id)))
    setUndo({ kind, item, index, label: itemLabel(kind, item) })
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_MS)
    focusFirst([addButtonId(kind)])
    void run(() => removeProfileItem({ kind, id }))
  }

  async function undoRemove() {
    const u = undo
    if (!u) return
    window.clearTimeout(undoTimer.current)
    setUndo(null)
    const { id: _drop, ...values } = u.item
    void _drop
    const res = await run(() => restoreProfileItem({ kind: u.kind, index: u.index, values }))
    if (!res.ok) return
    const restored = res.data as unknown as AnyItem
    setProfile((p) => {
      const list = listOf(p, u.kind)
      const at = Math.min(u.index, list.length)
      return withList(p, u.kind, [...list.slice(0, at), restored, ...list.slice(at)])
    })
    focusFirst([profileFieldId(u.kind, PROFILE_FIELDS[u.kind][0], restored.id)])
  }

  function move(kind: ProfileKind, id: string, dir: -1 | 1) {
    const list = listOf(profile, kind)
    const i = list.findIndex((x) => x.id === id)
    const j = i + dir
    if (i === -1 || j < 0 || j >= list.length) return
    const next = list.map((x, k) => (k === i ? list[j] : k === j ? list[i] : x))
    setProfile((p) => withList(p, kind, next))
    // Keep focus on the item that moved, even when it reaches the top or the bottom.
    const up = profileFieldId(kind, 'up', id)
    const down = profileFieldId(kind, 'down', id)
    focusFirst(dir < 0 ? [up, down] : [down, up])
    void run(() => reorderProfile({ kind, ids: next.map((x) => x.id) }))
  }

  function dismissUndo() {
    window.clearTimeout(undoTimer.current)
    setUndo(null)
  }

  return { profile, saveState, error, undo, update, add, remove, undoRemove, move, flushAll, dismissUndo }
}

/** "Saving…", "Saved", or what went wrong (H1, H9). */
export function saveText(state: SaveState, error: string | null, savedText = 'Saved'): string {
  if (state === 'saving') return 'Saving…'
  if (state === 'saved') return savedText
  if (state === 'error') return error ?? 'Couldn’t save. Your text is still here.'
  return ''
}

'use client'

import { useEffect, useRef, useState } from 'react'
import type { LinkKind, Section } from '@prisma/client'
import { focusFirst } from '@/components/ui/dialog'
import { generateCvPlan } from '@/features/ai/actions'
import { createBlock, createVersion, updateVersion } from '@/features/blocks/actions'
import { blankBullet, draftChanged, draftVersion, fromEditorBullets, toEditorBullets } from '@/features/blocks/bullets'
import { newBulletId } from '@/features/blocks/components/block-editor'
import { EMPTY_BLOCK_META } from '@/features/blocks/components/new-block-fields'
import { EMPTY_OVERLAY, applyOverlay, blockMatches, withVersions, type LibraryOverlay } from '@/features/blocks/library'
import type { LibBlock } from '@/features/blocks/types'
import { createJob } from '@/features/jobs/actions'
import type { JobData, SavedCv } from '@/features/jobs/types'
import { useProfileStore } from '@/features/profile/components/use-profile-store'
import type { ProfileData, ProfileKind } from '@/features/profile/types'
import { saveAskAnswer, saveCv } from '../actions'
import * as cv from '../composition'
import { plural, shorterVersions } from '../layout'
import { printBlockOf, printCv } from '../print'
import type { AiRun, AskState } from './ai-report'
import type { ComposeEditing } from './compose-editor'

export type ComposeProps = { jobs: JobData[]; library: LibBlock[]; profile: ProfileData; initialJobId: string | null }

type Peek = { blockId: string; versionId: string } | null
type Undo = { comp: cv.Composition; source: string } | null

const FLASH_MS = 1600

function startState(jobs: JobData[], library: LibBlock[], initialJobId: string | null) {
  const job = jobs.find((j) => j.id === initialJobId) ?? jobs[0] ?? null
  if (job?.cv) {
    const comp = cv.compositionFromSaved(job.cv, library)
    return { jobId: job.id, comp, savedSnap: cv.snapshot(comp) as string | null, source: 'saved' }
  }
  return { jobId: job?.id ?? null, comp: cv.fullComposition(library), savedSnap: null as string | null, source: 'full' }
}

function mergeJobs(server: JobData[], created: JobData[], saved: Record<string, SavedCv>): JobData[] {
  const known = new Set(server.map((j) => j.id))
  return [...created.filter((j) => !known.has(j.id)), ...server].map((j) => (saved[j.id] ? { ...j, cv: saved[j.id] } : j))
}

function scrollToId(id: string, delay: number) {
  window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), delay)
}

/** Everything Compose CV knows and does; the view only draws it. */
export function useCompose({ jobs: serverJobs, library: serverLibrary, profile: initialProfile, initialJobId }: ComposeProps) {
  const [createdJobs, setCreatedJobs] = useState<JobData[]>([])
  const [savedCvs, setSavedCvs] = useState<Record<string, SavedCv>>({})
  const [overlay, setOverlay] = useState<LibraryOverlay>(EMPTY_OVERLAY)
  const jobs = mergeJobs(serverJobs, createdJobs, savedCvs)
  const library = applyOverlay(serverLibrary, overlay)
  const blocks = new Map(library.map((b) => [b.id, b]))
  const store = useProfileStore(initialProfile)
  const profile = store.profile

  const [start] = useState(() => startState(serverJobs, serverLibrary, initialJobId))
  const [jobId, setJobId] = useState(start.jobId)
  const [comp, setComp] = useState(start.comp)
  const [savedSnap, setSavedSnap] = useState(start.savedSnap)
  const [source, setSource] = useState(start.source)

  const [verOpen, setVerOpen] = useState<string | null>(null)
  const [verQuery, setVerQuery] = useState('')
  const [peek, setPeek] = useState<Peek>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [libQuery, setLibQuery] = useState('')
  const [drag, setDrag] = useState<{ id: string | null; over: string | null; overSec: Section | null }>({ id: null, over: null, overSec: null })
  const [fitOpen, setFitOpen] = useState(false)
  const [jobOpen, setJobOpen] = useState(false)
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ComposeEditing | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [ai, setAi] = useState<AiRun | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [undo, setUndo] = useState<Undo>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [profOpen, setProfOpen] = useState<ProfileKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  const job = jobs.find((j) => j.id === jobId) ?? null
  const pendingJob = jobs.find((j) => j.id === pendingJobId) ?? null
  const hasSaved = !!job?.cv
  const dirty = savedSnap === null || cv.snapshot(comp) !== savedSnap

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  // Leaving with unsaved changes to a saved CV asks first (H3).
  useEffect(() => {
    if (!dirty || savedSnap === null) return
    const onLeave = (ev: BeforeUnloadEvent) => ev.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty, savedSnap])

  // ---- The page, with what you hover or type shown on it ----
  const editBlock = editing?.kind === 'edit' ? (blocks.get(editing.blockId) ?? null) : null
  const editVersion = editing?.kind === 'edit' && editBlock ? (editBlock.versions.find((v) => v.id === editing.versionId) ?? null) : null
  const draftPrint = editing?.kind === 'edit' && editBlock && editVersion ? { blockId: editBlock.id, version: draftVersion(editVersion, editing.draft, editBlock.name) } : null
  const newEntry =
    editing?.kind === 'new'
      ? {
          key: '__new',
          block: printBlockOf({ id: '__new', name: editing.meta.name.trim() || 'New block', section: editing.meta.section, org: editing.meta.org, location: editing.meta.location, dates: editing.meta.dates, stack: editing.meta.stack }),
          version: { id: '__new', name: 'Base', title: editing.draft.title.trim() || editing.meta.name.trim() || 'New block', bullets: fromEditorBullets(editing.draft.bullets) },
          peeked: false,
        }
      : null
  const base = printCv(comp, library, profile, { draft: draftPrint, newEntry })
  const shown = peek && !editing ? printCv(comp, library, profile, { peek, draft: draftPrint, newEntry }) : base
  const fit = base.fit

  const editChanged = editing ? (editing.kind === 'edit' ? !!editVersion && draftChanged(editVersion, editing.draft) : !!editing.meta.name.trim() && !!editing.draft.title.trim()) : false

  // ---- Small moves ----
  function flash(id: string) {
    window.clearTimeout(flashTimer.current)
    setFlashId(id)
    flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS)
    scrollToId(`pv-${id}`, 60)
  }

  function closePopovers() {
    setVerOpen(null)
    setPeek(null)
    setFitOpen(false)
  }

  const setVer = (blockId: string, versionId: string) => {
    setComp((c) => cv.setVersion(c, blockId, versionId))
    setVerOpen(null)
    setPeek(null)
    flash(blockId)
  }

  const add = (block: LibBlock) => {
    const version = cv.versionForJob(block, jobId) ?? cv.baseVersion(block)
    setComp((c) => cv.addBlock(c, block, version.id))
    flash(block.id)
  }

  const remove = (blockId: string) => {
    setComp((c) => cv.removeBlock(c, blockId))
    if (verOpen === blockId) setVerOpen(null)
    if (peek?.blockId === blockId) setPeek(null)
    setHoverId(null)
  }

  const move = (blockId: string, dir: -1 | 1) => {
    setComp((c) => cv.moveBy(c, blockId, dir))
    flash(blockId)
  }

  const openFromPreview = (blockId: string) => {
    setVerOpen(blockId)
    setVerQuery('')
    setPeek(null)
    scrollToId(`row-${blockId}`, 40)
  }

  // ---- Start from ----
  function load(key: string) {
    let next: cv.Composition | null = null
    if (key === 'saved' && job?.cv) next = cv.compositionFromSaved(job.cv, library)
    else if (key === 'full') next = cv.fullComposition(library)
    else if (key === 'empty') next = cv.emptyComposition(comp.pages)
    else if (key.startsWith('job:')) {
      const other = jobs.find((j) => j.id === key.slice(4))
      if (other?.cv) next = cv.compositionFromSaved(other.cv, library)
    }
    if (!next) return
    setComp(next)
    setSource(key)
    setAi(null)
    setUndo(null)
    closePopovers()
  }

  // ---- Jobs ----
  function switchJob(id: string) {
    const target = jobs.find((j) => j.id === id)
    setJobId(id)
    setJobOpen(false)
    setPendingJobId(null)
    setAi(null)
    setUndo(null)
    closePopovers()
    if (target?.cv) {
      const next = cv.compositionFromSaved(target.cv, library)
      setComp(next)
      setSavedSnap(cv.snapshot(next))
      setSource('saved')
    } else {
      // A job without a CV keeps the CV you had open as a starting point.
      setSavedSnap(null)
      setSource('keep')
    }
    window.history.replaceState(null, '', `?job=${encodeURIComponent(id)}`)
    focusFirst(['job-btn'])
  }

  function pickJob(id: string) {
    if (id === jobId) {
      setJobOpen(false)
      focusFirst(['job-btn'])
      return
    }
    if (dirty) setPendingJobId(id)
    else switchJob(id)
  }

  async function create(input: { company: string; role: string; links: { kind: LinkKind; url: string }[] }) {
    const res = await createJob(input)
    if (res.ok) setCreatedJobs((list) => [res.data, ...list])
    return res
  }

  async function save(): Promise<boolean> {
    if (!jobId || saving) return false
    setSaving(true)
    setSaveError(null)
    const items = cv.toSavedItems(comp)
    const res = await saveCv({ jobId, pages: comp.pages, sectionOrder: comp.order, showEducation: comp.edu, showSkills: comp.skills, showAchievements: comp.ach, items })
    setSaving(false)
    if (!res.ok) {
      setSaveError(res.error)
      return false
    }
    const saved: SavedCv = { pages: comp.pages, sectionOrder: comp.order, showEducation: comp.edu, showSkills: comp.skills, showAchievements: comp.ach, savedLabel: res.data.savedLabel, items }
    setSavedCvs((m) => ({ ...m, [jobId]: saved }))
    setSavedSnap(cv.snapshot(comp))
    setSource('saved')
    return true
  }

  async function saveAndSwitch() {
    const to = pendingJobId
    if (to && (await save())) switchJob(to)
  }

  // ---- Generate with AI ----
  async function generate() {
    if (!job || genBusy) return
    setGenBusy(true)
    closePopovers()
    const res = await generateCvPlan({ jobId: job.id, pages: comp.pages })
    setGenBusy(false)
    if (!res.ok) {
      setAi({ jobId: job.id, jobLabel: job.label, error: res.error, report: [], asks: [] })
      setAiOpen(true)
      return
    }
    setUndo({ comp, source })
    setComp(cv.compositionFromPlan(res.data, library))
    setSource('ai')
    setAi({ jobId: job.id, jobLabel: job.label, error: null, report: res.data.report, asks: res.data.asks.map((a) => ({ ...a, answer: '', status: 'open', error: null })) })
    setAiOpen(true)
  }

  function undoAi() {
    if (!undo) return
    setComp(undo.comp)
    setSource(undo.source)
    setAi(null)
    setUndo(null)
  }

  const setAsk = (id: string, patch: Partial<AskState>) => setAi((run) => (run ? { ...run, asks: run.asks.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : run))

  async function sendAsk(ask: AskState) {
    if (!ai || !ask.answer.trim()) return
    setAsk(ask.id, { status: 'sending', error: null })
    const res = await saveAskAnswer({ jobId: ai.jobId, question: ask.text, answer: ask.answer })
    setAsk(ask.id, res.ok ? { status: 'sent' } : { status: 'open', error: res.error })
  }

  // ---- Edit a block, or write a new one ----
  function openEdit(blockId: string) {
    const section = cv.sectionOf(comp, blockId)
    const row = section ? comp.items[section].find((r) => r.blockId === blockId) : null
    const block = blocks.get(blockId)
    if (!row || !block) return
    const cur = block.versions.find((v) => v.id === row.versionId) ?? block.versions[0]
    const bullets = toEditorBullets(cur.bullets, () => newBulletId())
    const madeForJob = !!jobId && cur.jobIds.includes(jobId)
    setEditing({ kind: 'edit', blockId, versionId: cur.id, draft: { title: cur.title, bullets: bullets.length ? bullets : [blankBullet(newBulletId(), 'PROJECT')] }, saveAs: madeForJob || !jobId ? 'update' : 'new' })
    setEditError(null)
    closePopovers()
    setJobOpen(false)
  }

  function startNewBlock() {
    const q = libQuery.trim()
    const noMatch = !!q && !library.some((b) => blockMatches(b, q))
    setEditing({
      kind: 'new',
      meta: { ...EMPTY_BLOCK_META, name: noMatch ? q : '' },
      draft: { title: '', bullets: [blankBullet(newBulletId(), 'PROJECT'), blankBullet(newBulletId(), 'STACK'), blankBullet(newBulletId(), 'IMPACT')] },
      focusTitle: noMatch,
    })
    setEditError(null)
    closePopovers()
    setProfOpen(null)
  }

  async function saveEdit() {
    if (!editing || !editChanged || editBusy) return
    setEditBusy(true)
    setEditError(null)
    const bullets = fromEditorBullets(editing.draft.bullets)
    if (editing.kind === 'new') {
      const res = await createBlock({ ...editing.meta, title: editing.draft.title, bullets, jobId })
      setEditBusy(false)
      if (!res.ok) return setEditError(res.error)
      setOverlay((o) => ({ ...o, blocks: [...o.blocks, res.data] }))
      setComp((c) => cv.addBlock(c, res.data, res.data.versions[0].id))
      setLibQuery('')
      setEditing(null)
      flash(res.data.id)
      focusFirst([`ed-btn-${res.data.id}`], 120)
      return
    }
    const title = draftPrint?.version.title ?? editing.draft.title
    const res =
      editing.saveAs === 'update' || !jobId
        ? await updateVersion({ versionId: editing.versionId, title, bullets })
        : await createVersion({ blockId: editing.blockId, sourceVersionId: editing.versionId, name: '', title, bullets, jobId })
    setEditBusy(false)
    if (!res.ok) return setEditError(res.error)
    setOverlay((o) => withVersions(o, [res.data]))
    setComp((c) => cv.setVersion(c, editing.blockId, res.data.id))
    setEditing(null)
    flash(editing.blockId)
  }

  // ---- Fit ----
  const fixes = fit.over
    ? shorterFixes(comp, blocks).map((s) => ({
        key: s.blockId,
        text: `${s.blockName}: “${s.version.name || 'Untitled version'}” is ${plural(s.lines, 'line')} shorter`,
        action: 'Use',
        label: `Use the ${s.version.name || 'untitled'} version of ${s.blockName}`,
        onUse: () => setVer(s.blockId, s.version.id),
        onPeek: () => setPeek({ blockId: s.blockId, versionId: s.version.id }),
      }))
    : []

  return {
    jobs, library, blocks, store, profile, job, pendingJob, jobId, comp, setComp, source, hasSaved, dirty,
    verOpen, setVerOpen, verQuery, setVerQuery, peek, setPeek, hoverId, setHoverId, flashId, libQuery, setLibQuery, drag, setDrag,
    fitOpen, setFitOpen, jobOpen, setJobOpen, setPendingJobId, editing, setEditing, editBusy, editError, editChanged, editBlock, editVersion,
    ai, setAi, aiOpen, setAiOpen, undo, setUndo, genBusy, profOpen, setProfOpen, saving, saveError,
    base, shown, fit, fixes,
    flash, setVer, add, remove, move, openFromPreview, load, switchJob, pickJob, create, save, saveAndSwitch,
    generate, undoAi, setAsk, sendAsk, openEdit, startNewBlock, saveEdit,
  }
}

function shorterFixes(comp: cv.Composition, blocks: Map<string, LibBlock>) {
  const rows = comp.order.flatMap((s) =>
    comp.items[s].flatMap((r) => {
      const block = blocks.get(r.blockId)
      if (!block) return []
      const current = block.versions.find((v) => v.id === r.versionId) ?? block.versions[0]
      return [{ block: printBlockOf(block), current, versions: block.versions }]
    }),
  )
  return shorterVersions(rows)
}

export type ComposeState = ReturnType<typeof useCompose>

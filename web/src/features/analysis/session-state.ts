// The Job analysis session's transitions (pure and immutable): every change returns a new session.
// The screen keeps one AnalysisSession in state and saves it with the job, so a reload resumes (H1, P2).
import type { AnalysisDraft, DraftBullet, JobAnalysis, ReusedVersion } from '../ai/types'
import { SESSION_VERSION, type AnalysisSession, type SentAnswer, type SessionDraft } from './types'

/** What a discarded draft needs to come back where it was (one undo, like the rest of the app). */
export type DraftUndo = { draft: SessionDraft; index: number }

const toSessionDraft = (d: AnalysisDraft, keep = true): SessionDraft => ({ ...d, keep, editedByHand: false, saveAs: 'new' })

/** Which block a draft is for: the same block drafted again replaces the earlier draft. */
const blockKey = (d: Pick<AnalysisDraft, 'blockId' | 'newBlock'>): string => d.blockId ?? `new:${(d.newBlock?.name ?? '').trim().toLowerCase()}`

/** `key`, or `key-2`, `key-3`… when it is already taken. */
function freeKey(key: string, taken: ReadonlySet<string>): string {
  if (!taken.has(key)) return key
  let n = 2
  while (taken.has(`${key}-${n}`)) n += 1
  return `${key}-${n}`
}

export function newSession(analysis: JobAnalysis, now: string): AnalysisSession {
  return {
    v: SESSION_VERSION,
    analysis,
    answers: {},
    dont: {},
    sent: {},
    drafts: analysis.drafts.map((d) => toSessionDraft(d)),
    asIsOut: [],
    pages: 1,
    step: 'input',
    analyzedAt: now,
    savedAt: null,
  }
}

/**
 * A new analysis after your answers (or "Ask for changes"). Drafts you edited by hand stay as you left
 * them (P2); a block you unticked stays unticked; answers and what was sent stay. An edited draft whose
 * block the AI no longer drafts goes to the end.
 */
export function applyRedraft(s: AnalysisSession, analysis: JobAnalysis, now: string): AnalysisSession {
  const edited = new Map(s.drafts.filter((d) => d.editedByHand).map((d) => [blockKey(d), d]))
  const unticked = new Set(s.drafts.filter((d) => !d.keep).map(blockKey))
  const taken = new Set<string>()
  const take = (d: SessionDraft): SessionDraft => {
    const key = freeKey(d.key, taken)
    taken.add(key)
    return key === d.key ? d : { ...d, key }
  }
  const placed = new Set<string>()
  const fromAi = analysis.drafts.map((d) => {
    const k = blockKey(d)
    placed.add(k)
    return take(edited.get(k) ?? toSessionDraft(d, !unticked.has(k)))
  })
  const leftOver = [...edited.entries()].filter(([k]) => !placed.has(k)).map(([, d]) => take(d))
  const reusedIds = new Set(analysis.reused.map((r) => r.versionId))
  return {
    ...s,
    analysis,
    drafts: [...fromAi, ...leftOver],
    asIsOut: s.asIsOut.filter((id) => reusedIds.has(id)),
    step: s.step === 'input' ? 'drafts' : s.step,
    analyzedAt: now,
  }
}

export const setAnswer = (s: AnalysisSession, askId: string, text: string): AnalysisSession => ({ ...s, answers: { ...s.answers, [askId]: text } })

export const setDont = (s: AnalysisSession, askId: string, dont: boolean): AnalysisSession => ({ ...s, dont: { ...s.dont, [askId]: dont } })

/** Questions with a written answer or "I don't have this". */
export function answeredCount(s: AnalysisSession): number {
  return s.analysis.asks.filter((a) => s.dont[a.id] || (s.answers[a.id] ?? '').trim()).length
}

export const markSent = (s: AnalysisSession, askId: string, sent: SentAnswer): AnalysisSession => ({ ...s, sent: { ...s.sent, [askId]: sent } })

type DraftPatch = Partial<Pick<SessionDraft, 'title' | 'bullets' | 'saveAs' | 'keep'>>

/** Changes one draft; a new title or new bullets mark it as edited by hand, so a redraft keeps it. */
export function updateDraft(s: AnalysisSession, key: string, patch: DraftPatch): AnalysisSession {
  const content = patch.title !== undefined || patch.bullets !== undefined
  return {
    ...s,
    drafts: s.drafts.map((d) => (d.key === key ? { ...d, ...patch, editedByHand: d.editedByHand || content } : d)),
  }
}

export const setKeep = (s: AnalysisSession, key: string, keep: boolean): AnalysisSession => updateDraft(s, key, { keep })

export function discardDraft(s: AnalysisSession, key: string): { session: AnalysisSession; undo: DraftUndo | null } {
  const index = s.drafts.findIndex((d) => d.key === key)
  if (index < 0) return { session: s, undo: null }
  return { session: { ...s, drafts: s.drafts.filter((d) => d.key !== key) }, undo: { draft: s.drafts[index], index } }
}

export function restoreDraft(s: AnalysisSession, undo: DraftUndo | null): AnalysisSession {
  if (!undo || s.drafts.some((d) => d.key === undo.draft.key)) return s
  const drafts = [...s.drafts]
  drafts.splice(Math.min(undo.index, drafts.length), 0, undo.draft)
  return { ...s, drafts }
}

/** A draft from outside the analysis (Not met → "+ Add experience"): unticked until you keep it. */
export function addDraft(s: AnalysisSession, d: AnalysisDraft, keep = false): AnalysisSession {
  const key = freeKey(d.key, new Set(s.drafts.map((x) => x.key)))
  return { ...s, drafts: [...s.drafts, toSessionDraft({ ...d, key }, keep)] }
}

/** × on a block used as it is: out of this CV; a second click brings it back. */
export function toggleAsIsOut(s: AnalysisSession, versionId: string): AnalysisSession {
  const out = s.asIsOut.includes(versionId)
  return { ...s, asIsOut: out ? s.asIsOut.filter((id) => id !== versionId) : [...s.asIsOut, versionId] }
}

/**
 * Editing a block used as it is: it becomes a draft of a new version for this job (or an update of that
 * version, per Save as), keeps what it matched, and the as-is copy leaves the CV.
 */
export function editAsIs(
  s: AnalysisSession,
  r: ReusedVersion,
  edit: { name: string; title: string; bullets: DraftBullet[]; saveAs: 'new' | 'update' },
): AnalysisSession {
  const key = freeKey(`asis-${r.versionId}`, new Set(s.drafts.map((d) => d.key)))
  const made: SessionDraft = {
    key,
    blockId: r.blockId,
    newBlock: null,
    name: edit.name,
    title: edit.title,
    bullets: edit.bullets,
    waitingOn: null,
    blockName: r.blockName,
    note: '',
    fromVersionId: r.versionId,
    fromVersionName: r.versionName,
    improvedBy: null,
    matches: r.matches,
    keep: true,
    editedByHand: true,
    saveAs: edit.saveAs,
  }
  return { ...s, drafts: [...s.drafts, made], asIsOut: s.asIsOut.includes(r.versionId) ? s.asIsOut : [...s.asIsOut, r.versionId] }
}

export const setPages = (s: AnalysisSession, pages: 1 | 2): AnalysisSession => ({ ...s, pages })

export const setStep = (s: AnalysisSession, step: AnalysisSession['step']): AnalysisSession => ({ ...s, step })

export const markSaved = (s: AnalysisSession, now: string): AnalysisSession => ({ ...s, step: 'saved', savedAt: now })

/** The step pills: 2 Your input, 3 Drafts, 4 Review & save, 5 all done (0–1 are reading and comparing). */
export function pipelineStep(s: AnalysisSession): number {
  return { input: 2, drafts: 3, review: 4, saved: 5 }[s.step]
}

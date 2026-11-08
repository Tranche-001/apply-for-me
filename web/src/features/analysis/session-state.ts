// The Job analysis session's transitions (pure and immutable): every change returns a new session.
// The screen keeps one AnalysisSession in state and saves it with the job, so a reload resumes (H1, P2).
import type { AiAsk, AnalysisDraft, DraftBullet, JobAnalysis, ReusedVersion } from '../ai/types'
// Which block a draft is for: the same block drafted again replaces the earlier draft.
import { blockKey } from './block-key'
import { keepBefore } from './cv-review'
import { SESSION_LIMITS } from './session'
import { SESSION_VERSION, type AnalysisSession, type SentAnswer, type SessionDraft } from './types'

/** What a discarded draft needs to come back where it was (one undo, like the rest of the app). */
export type DraftUndo = { draft: SessionDraft; index: number }

const toSessionDraft = (d: AnalysisDraft, keep = true): SessionDraft => ({ ...d, keep, editedByHand: false, saveAs: 'new' })


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

const normText = (t: string): string => t.trim().replace(/\s+/g, ' ').toLowerCase()

/** Made by you rather than the AI: "+ Add experience" (add-) or a block used as it is that you edited (asis-). */
const isUserMade = (d: SessionDraft): boolean => d.key.startsWith('add-') || d.key.startsWith('asis-')

/** A draft a redraft must not throw away. */
const isCarried = (d: SessionDraft): boolean => d.editedByHand || isUserMade(d)

const ownValue = <T>(record: Readonly<Record<string, T>>, key: string): T | undefined => (Object.hasOwn(record, key) ? record[key] : undefined)

/**
 * The new requirement id for an old one: same normalized text, else a posting sentence both quote (quotes
 * are the posting's own words, so they survive the AI rewording the requirement); null when neither.
 */
function requirementRemap(from: JobAnalysis, to: JobAnalysis): (oldId: string) => string | null {
  const byText = new Map<string, string>()
  const byQuote = new Map<string, string>()
  for (const r of to.requirements) {
    if (!byText.has(normText(r.text))) byText.set(normText(r.text), r.id)
    for (const q of r.quotes) if (!byQuote.has(normText(q))) byQuote.set(normText(q), r.id)
  }
  const old = new Map(from.requirements.map((r) => [r.id, r]))
  return (oldId) => {
    const r = old.get(oldId)
    if (!r) return null
    const sameText = byText.get(normText(r.text))
    if (sameText) return sameText
    for (const q of r.quotes) {
      const shared = byQuote.get(normText(q))
      if (shared) return shared
    }
    return null
  }
}

type MergedAsks = { asks: AiAsk[]; keptIds: ReadonlySet<string>; finalId: (newId: string) => string | null }

/**
 * Questions after a redraft: every old question that has an answer, "I don't have this" or a sent entry stays
 * (same id, same order), then the new questions. A new question that is an old one re-asked (same text) is skipped;
 * one whose id an old question already uses gets a free id. `finalId` says where a new question's id ended up.
 */
function mergeAsks(s: AnalysisSession, next: JobAnalysis, remapRequirement: (oldId: string) => string | null): MergedAsks {
  const isAnswered = (a: AiAsk) => Boolean((ownValue(s.answers, a.id) ?? '').trim()) || ownValue(s.dont, a.id) === true || Object.hasOwn(s.sent, a.id)
  const kept = s.analysis.asks.filter(isAnswered).map((a): AiAsk => ({ ...a, requirementId: a.requirementId ? remapRequirement(a.requirementId) : a.requirementId }))
  const keptIds = new Set(kept.map((a) => a.id))
  const keptByText = new Map(kept.map((a) => [normText(a.text), a.id]))
  const used = new Set([...keptIds, ...next.asks.map((a) => a.id)])
  const idMap = new Map<string, string>()
  const added: AiAsk[] = []
  for (const a of next.asks) {
    const same = keptByText.get(normText(a.text))
    if (same !== undefined) {
      idMap.set(a.id, same)
      continue
    }
    let id = a.id
    if (keptIds.has(id)) {
      let n = 1
      while (used.has(`q${n}`)) n += 1
      id = `q${n}`
      used.add(id)
    }
    idMap.set(a.id, id)
    added.push({ ...a, id })
  }
  const asks = [...kept, ...added].slice(0, SESSION_LIMITS.asks)
  const finalIds = new Set(asks.map((a) => a.id))
  return { asks, keptIds, finalId: (newId) => (idMap.has(newId) && finalIds.has(idMap.get(newId)!) ? idMap.get(newId)! : null) }
}

/** Keeps only the entries of `record` whose key is in `keys`. */
function onlyKeys<T>(record: Readonly<Record<string, T>>, keys: ReadonlySet<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => keys.has(k)))
}

/**
 * A new analysis after your answers (or "Ask for changes"). Nothing you answered is lost: answered questions
 * stay with their ids and the new ones are added around them (mergeAsks). Drafts you edited by hand, or made
 * yourself (+ Add experience, a block you edited from "used as it is"), stay as you left them (P2); an edited
 * draft takes the place of the AI's new draft of the same block (one for one), the rest go to the end. A block
 * you unticked stays unticked. What was sent stays.
 */
export function applyRedraft(s: AnalysisSession, analysis: JobAnalysis, now: string): AnalysisSession {
  const remapRequirement = requirementRemap(s.analysis, analysis)
  const merged = mergeAsks(s, analysis, remapRequirement)
  const carriedDraft = (d: SessionDraft): SessionDraft => ({
    ...d,
    improvedBy: d.improvedBy !== null && merged.keptIds.has(d.improvedBy) ? d.improvedBy : null,
    matches: d.matches.flatMap((m) => {
      const requirementId = remapRequirement(m.requirementId)
      return requirementId === null ? [] : [{ ...m, requirementId }]
    }),
  })

  const carried = s.drafts.filter(isCarried).map(carriedDraft)
  const waiting = new Map<string, SessionDraft[]>()
  for (const d of carried.filter((c) => !isUserMade(c))) waiting.set(blockKey(d), [...(waiting.get(blockKey(d)) ?? []), d])
  const unticked = new Set(s.drafts.filter((d) => !d.keep).map(blockKey))

  const placed = new Set<SessionDraft>()
  const slots = analysis.drafts.map((d): SessionDraft => {
    const mine = waiting.get(blockKey(d))?.shift()
    if (mine) {
      placed.add(mine)
      return mine
    }
    return toSessionDraft({ ...d, improvedBy: d.improvedBy === null ? null : merged.finalId(d.improvedBy) }, !unticked.has(blockKey(d)))
  })
  const ordered = [...slots, ...carried.filter((d) => !placed.has(d))]

  const fresh = (d: SessionDraft) => !carried.includes(d)
  while (ordered.length > SESSION_LIMITS.drafts && ordered.some(fresh)) ordered.splice(ordered.findLastIndex(fresh), 1)

  const taken = new Set<string>()
  const drafts = ordered.slice(0, SESSION_LIMITS.drafts).map((d) => {
    const key = freeKey(d.key, taken)
    taken.add(key)
    return key === d.key ? d : { ...d, key }
  })
  const reusedIds = new Set(analysis.reused.map((r) => r.versionId))
  // An After CV from REVIEW was made from the old drafts: a new analysis closes it (the Before CV is this one).
  return {
    ...keepBefore(s),
    analysis: { ...analysis, asks: merged.asks },
    answers: onlyKeys(s.answers, merged.keptIds),
    dont: onlyKeys(s.dont, merged.keptIds),
    sent: onlyKeys(s.sent, merged.keptIds),
    drafts,
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

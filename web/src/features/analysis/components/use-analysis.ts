'use client'

// The Job analysis pipeline's state and flows: start from a link, compare, answer, place the answers,
// redraft, review and save. The session is saved with the job as you go (autosave), so a reload resumes.
import { useCallback, useRef, useState } from 'react'
import { analyzeJob, placeAnswers } from '../../ai/actions'
import type { AnswerPlacement } from '../../ai/types'
import { useAutosave } from '../../ai/ui/use-autosave'
import { addAnswersToExperiences, resendAnswer } from '../../experiences/actions'
import { addExperienceForRequirement, saveAnalysisCv, saveAnalysisSession, startFromPosting, startPickedJob, type SplitCandidate, type StartedJob } from '../actions'
import type { LoadedAnalysisJob } from '../queries'
import { applyRedraft, markSaved, markSent, newSession, setStep, type DraftUndo } from '../session-state'
import type { StartSource } from '../start-types'
import type { AnalysisSession, ExperienceOption, JobSummary, SentAnswer } from '../types'
import type { Destination, PlacementItem } from './placement-popover'
import { splitNotice, typedLinks, unreadNotice } from './start-links'
import { askNumber, topicFor } from './view-model'

export type Phase = 'idle' | 'reading' | 'comparing' | 'placing' | 'redrafting' | 'saving'

export type ModalState =
  | { kind: 'answer'; askId: string; mode: 'live' | 'sent' }
  | { kind: 'placement'; items: PlacementItem[]; skipped: { n: number; topic: string }[] }
  | { kind: 'jobReq'; reqId: string }
  | { kind: 'posting'; reqId: string; backLabel: string; back: ModalState }
  | { kind: 'met'; reqId: string; backBlock: string | null }
  | { kind: 'notMet'; reqId: string }
  | { kind: 'block'; ref: string }
  | null

export type Problem = { message: string; retry: (() => void) | null }
export type NotMetState = { busy: boolean; done: { place: string; isNew: boolean } | null; error: string | null }
export type UndoState = { undo: DraftUndo | null; asIsVersion: string | null; label: string }

type SendItem = { askId: string; question: string; answer: string }

const NO_NOT_MET: NotMetState = { busy: false, done: null, error: null }
const now = () => new Date().toISOString()
const OFFLINE = 'Couldn’t reach the app. Check that it is running, then try again.'
const RELOAD = 'The app was updated since this page opened. Reload the page, then try again.'
/** A tab opened before the app was rebuilt calls server actions that no longer exist. */
const reloadNeeded = (err: unknown): boolean => err instanceof Error && /server action|older or newer deployment|unexpected response/i.test(err.message)

// Stable on purpose: useAutosave rebuilds its timer when these change, and a new closure each render would
// save the whole session on every keystroke.
const saveSession = (v: { jobId: string; session: AnalysisSession }) => saveAnalysisSession(v)
const sameJob = (a: { jobId: string }, b: { jobId: string }) => a.jobId === b.jobId

/** Every question's answer for the AI: "I don't have this" is null, unanswered is ''. */
const answersFor = (s: AnalysisSession) =>
  s.analysis.asks.map((a) => ({ id: a.id, question: a.text, answer: s.dont[a.id] ? null : (s.answers[a.id] ?? '') }))

/** Drafts you edited by hand go back to the AI, so a redraft builds on them instead of replacing them (P2). */
const draftsBrief = (s: AnalysisSession, all: boolean) =>
  s.drafts
    .filter((d) => all || d.editedByHand)
    .map((d) => ({ blockName: d.blockName, title: d.title, bullets: d.bullets.filter((b) => b.kind !== 'MISSING').map((b) => b.text) }))

const dontSent = (question: string): SentAnswer => ({ question, answer: null, entry: null, experienceId: null, experienceTitle: '', isNewExperience: false, resent: false })

/** Written answers not sent yet. */
const toSend = (s: AnalysisSession): SendItem[] =>
  s.analysis.asks
    .filter((a) => !s.dont[a.id] && !s.sent[a.id] && (s.answers[a.id] ?? '').trim())
    .map((a) => ({ askId: a.id, question: a.text, answer: (s.answers[a.id] ?? '').trim() }))

export function useAnalysis(init: { loaded: LoadedAnalysisJob | null; experiences: ExperienceOption[] }) {
  const [job, setJob] = useState<JobSummary | null>(init.loaded?.job ?? null)
  const [postingText, setPostingText] = useState(init.loaded?.postingText ?? '')
  const [session, setSession] = useState<AnalysisSession | null>(init.loaded?.session ?? null)
  const [resumed, setResumed] = useState(Boolean(init.loaded?.session))
  const [phase, setPhase] = useState<Phase>('idle')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [experiences, setExperiences] = useState(init.experiences)
  const [modal, setModal] = useState<ModalState>(null)
  const [undo, setUndo] = useState<UndoState | null>(null)
  const [notMet, setNotMet] = useState<NotMetState>(NO_NOT_MET)
  /** The jobs found in what was read, while the user picks one (nothing is created yet). */
  const [split, setSplit] = useState<{ candidates: SplitCandidate[]; urls: string[]; source: StartSource } | null>(null)
  /** The "Which job?" step pill: 'cur' while choosing, 'done' after a pick for the rest of that pipeline (not saved). */
  const [whichJob, setWhichJob] = useState<'cur' | 'done' | null>(null)
  const sessionRef = useRef(session)
  const jobRef = useRef(job)

  const autosave = useAutosave(saveSession, { sameTarget: sameJob })
  const { queue } = autosave

  /** The one way the session changes: state, the ref async flows read, and the autosave. */
  const commit = useCallback(
    (next: AnalysisSession | null) => {
      sessionRef.current = next
      setSession(next)
      const j = jobRef.current
      if (next && j) queue({ jobId: j.id, session: next })
    },
    [queue],
  )
  const change = useCallback((fn: (s: AnalysisSession) => AnalysisSession) => {
    const s = sessionRef.current
    if (s) commit(fn(s))
  }, [commit])

  // A failure closes any popover, so its message and Retry are seen (they sit at the top of the page).
  const fail = (message: string, retry: (() => void) | null) => {
    setPhase('idle')
    setModal(null)
    setProblem({ message, retry })
  }

  /** Every flow ends idle: a thrown action (network, timeout) becomes a plain error with Retry. */
  const guard =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      try {
        await fn(...args)
      } catch (err) {
        if (reloadNeeded(err)) return fail(RELOAD, () => window.location.reload())
        fail(OFFLINE, () => void guard(fn)(...args))
      }
    }

  const addExperiences = (placed: { experienceId: string; title: string }[]) =>
    setExperiences((list) => {
      const known = new Set(list.map((e) => e.id))
      return [...list, ...placed.filter((p) => p.experienceId && !known.has(p.experienceId)).map((p) => ({ id: p.experienceId, title: p.title }))]
    })

  async function compare(target: JobSummary, base: AnalysisSession | null): Promise<void> {
    setPhase('comparing')
    setProblem(null)
    const res = await analyzeJob({ jobId: target.id, answers: base ? answersFor(base) : [], previousDrafts: base ? draftsBrief(base, false) : [] })
    if (!res.ok) return fail(res.error, () => void compare(target, base))
    const current = sessionRef.current
    const next = base && current ? applyRedraft(current, res.data, now()) : newSession(res.data, now())
    commit(res.data.asks.length || base ? next : setStep(next, 'drafts'))
    setPhase('idle')
  }

  /** A started job (new or found): it becomes the open job, then the AI compares it with your blocks. */
  async function open(started: StartedJob, typedCount: number, notices: (string | null)[]): Promise<void> {
    const { job: j, existed, postingText: text, unread } = started
    jobRef.current = j
    setJob(j)
    setPostingText(text)
    setResumed(false)
    commit(null)
    window.history.replaceState(null, '', `?job=${encodeURIComponent(j.id)}`)
    const already = existed ? `You already had ${j.label}. The AI is analyzing it again.` : null
    const notice = [...notices, unreadNotice(unread, typedCount), already].filter(Boolean).join(' ')
    setNotice(notice || null)
    await compare(j, null)
  }

  async function start(input: { urls: string[] } | { text: string }): Promise<void> {
    setPhase('reading')
    setProblem(null)
    setNotice(null)
    const res = await startFromPosting(input)
    if (!res.ok) return fail(res.error, null)
    const typedCount = 'urls' in input ? typedLinks(input.urls).length : 0
    if (res.data.kind === 'split') {
      // More than one job (or track) in what was read: nothing is created until one is picked.
      const { candidates, urls, unread, source } = res.data
      setSplit({ candidates, urls, source })
      setWhichJob('cur')
      setNotice([splitNotice(candidates.length, source, candidates.every((x) => x.track)), unreadNotice(unread, typedCount)].filter(Boolean).join(' '))
      setPhase('idle')
      return
    }
    if (res.data.kind !== 'job') return fail('Unexpected answer from the app. Reload the page, then try again.', null)
    setWhichJob(null)
    await open(res.data, typedCount, [])
  }

  /** "Analyze this job": the picked job is created (or found) with its own text and the links, then compared. */
  async function analyzePicked(candidateId: string): Promise<void> {
    const picked = split?.candidates.find((x) => x.id === candidateId)
    if (!split || !picked) return
    setPhase('comparing')
    setProblem(null)
    setNotice(null)
    const res = await startPickedJob({ company: picked.company, role: picked.role, text: picked.text, urls: split.urls })
    if (!res.ok) return fail(res.error, () => void guard(analyzePicked)(candidateId))
    setSplit(null)
    setWhichJob('done')
    await open(res.data, 0, [])
  }

  /** "← Use another link": back to the start card, with the links or text that were typed still there. */
  function useAnotherLink(): void {
    setSplit(null)
    setWhichJob(null)
    setProblem(null)
    setNotice(null)
  }

  /** "Analyze again": compare the saved posting again; answers, sent answers and your edits stay. */
  async function analyzeAgain(): Promise<void> {
    const j = jobRef.current
    if (!j) return
    setResumed(false)
    await compare(j, sessionRef.current)
  }

  async function redraft(instruction: string | null = null): Promise<void> {
    const s = sessionRef.current
    const j = jobRef.current
    if (!s || !j) return
    setPhase('redrafting')
    setProblem(null)
    const res = await analyzeJob({ jobId: j.id, answers: answersFor(s), instruction, previousDrafts: draftsBrief(s, Boolean(instruction)) })
    if (!res.ok) return fail(res.error, () => void redraft(instruction))
    const current = sessionRef.current
    if (current) commit(applyRedraft(current, res.data, now()))
    setPhase('idle')
  }

  /** Adds the answers where you (or the AI) chose, records them as sent, then redrafts. */
  async function file(dest: Record<string, Destination | null>, items: SendItem[]): Promise<void> {
    const j = jobRef.current
    if (!j) return
    setPhase('placing')
    const res = await addAnswersToExperiences({
      jobId: j.id,
      items: items.map((i) => {
        const d = dest[i.askId] ?? null
        return { question: i.question, answer: i.answer, experienceId: d?.kind === 'existing' ? d.id : null, newExperienceTitle: d?.kind === 'new' ? d.name : null }
      }),
    })
    if (!res.ok) return fail(res.error, () => void file(dest, items))
    let next = sessionRef.current
    res.data.forEach((p, i) => {
      if (next) next = markSent(next, items[i].askId, { question: items[i].question, answer: items[i].answer, entry: p.entry, experienceId: p.experienceId, experienceTitle: p.title, isNewExperience: p.isNew, resent: false })
    })
    commit(next)
    addExperiences(res.data)
    setModal(null)
    await redraft()
  }

  /** "Update drafts with my answers": the AI places each answer; it asks only when it can't tell where. */
  async function updateDrafts(): Promise<void> {
    const s0 = sessionRef.current
    const j = jobRef.current
    if (!s0 || !j) return
    const s = s0.analysis.asks.reduce((acc, a) => (acc.dont[a.id] && !acc.sent[a.id] ? markSent(acc, a.id, dontSent(a.text)) : acc), s0)
    commit(s)
    const items = toSend(s)
    if (!items.length) return redraft()
    setPhase('placing')
    setProblem(null)
    const placed = await placeAnswers({ jobId: j.id, items })
    if (!placed.ok) return fail(placed.error, () => void updateDrafts())
    if (placed.data.every((p) => p.experienceId)) {
      return file(Object.fromEntries(placed.data.map((p) => [p.askId, { kind: 'existing', id: p.experienceId as string } as Destination])), items)
    }
    setPhase('idle')
    setModal({ kind: 'placement', items: placementItems(s, items, placed.data), skipped: skippedFor(s) })
  }

  const placementItems = (s: AnalysisSession, items: SendItem[], placed: AnswerPlacement[]): PlacementItem[] =>
    items.map((i) => {
      const p = placed.find((x) => x.askId === i.askId)
      return { ...i, n: askNumber(s, i.askId), topic: topicFor(s, i.askId), aiPick: p?.experienceId ?? null, alsoFits: p?.alsoFits ?? [], why: p?.why ?? '', suggestNew: p?.newExperienceName ?? null }
    })

  const skippedFor = (s: AnalysisSession) => s.analysis.asks.filter((a) => s.dont[a.id]).map((a) => ({ n: askNumber(s, a.id), topic: topicFor(s, a.id) }))

  /** Placement popover: your choices (or "Not now": the answers place). */
  const confirmPlacement = (dest: Record<string, Destination | null>) => {
    const s = sessionRef.current
    if (s) void guard(file)(dest, toSend(s))
  }

  /** Resend one question: only the text it wrote to the experience is replaced (or removed), then a redraft. */
  async function send(askId: string): Promise<void> {
    const s = sessionRef.current
    const j = jobRef.current
    const ask = s?.analysis.asks.find((a) => a.id === askId)
    if (!s || !j || !ask) return
    const prev = s.sent[askId]
    const dont = Boolean(s.dont[askId])
    const text = (s.answers[askId] ?? '').trim()
    setPhase('placing')
    setProblem(null)
    if (prev?.entry && prev.experienceId) {
      const res = await resendAnswer({ jobId: j.id, experienceId: prev.experienceId, oldEntry: prev.entry, question: ask.text, answer: dont ? null : text })
      if (!res.ok) return fail(res.error, () => void send(askId))
      change((cur) => markSent(cur, askId, { ...prev, answer: dont ? null : text, entry: res.data.entry, experienceId: res.data.experienceId, experienceTitle: res.data.title || prev.experienceTitle, resent: true }))
    } else if (dont) {
      change((cur) => markSent(cur, askId, { ...dontSent(ask.text), resent: true }))
    } else {
      const placed = await placeAnswers({ jobId: j.id, items: [{ askId, question: ask.text, answer: text }] })
      const p = placed.ok ? placed.data[0] : null
      const res = await addAnswersToExperiences({ jobId: j.id, items: [{ question: ask.text, answer: text, experienceId: p?.experienceId ?? null, newExperienceTitle: p?.experienceId ? null : (p?.newExperienceName ?? null) }] })
      if (!res.ok) return fail(res.error, () => void send(askId))
      const r = res.data[0]
      change((cur) => markSent(cur, askId, { question: ask.text, answer: text, entry: r.entry, experienceId: r.experienceId, experienceTitle: r.title, isNewExperience: r.isNew, resent: true }))
      addExperiences(res.data)
    }
    await redraft()
  }

  /** Not met → "+ Add experience": the AI files what you wrote and drafts a block for this CV. */
  async function addExperience(reqId: string, v: { experienceId: string | null; newExperienceTitle: string | null; text: string }): Promise<void> {
    const s = sessionRef.current
    const j = jobRef.current
    const req = s?.analysis.requirements.find((r) => r.id === reqId)
    if (!s || !j || !req) return
    setNotMet({ busy: true, done: null, error: null })
    let res: Awaited<ReturnType<typeof addExperienceForRequirement>>
    try {
      res = await addExperienceForRequirement({ jobId: j.id, requirementId: reqId, requirementName: req.text, ...v })
    } catch {
      return setNotMet({ busy: false, done: null, error: OFFLINE })
    }
    if (!res.ok) return setNotMet({ busy: false, done: null, error: res.error })
    change((cur) => ({ ...cur, drafts: [...cur.drafts, { ...res.data.draft, keep: false, editedByHand: false, saveAs: 'new' }] }))
    addExperiences([res.data.placed])
    setNotMet({ busy: false, done: { place: res.data.placed.title, isNew: res.data.placed.isNew }, error: null })
  }

  async function save(cv: Parameters<typeof saveAnalysisCv>[0]['cv']): Promise<void> {
    const s = sessionRef.current
    const j = jobRef.current
    if (!s || !j) return
    setPhase('saving')
    setProblem(null)
    const res = await saveAnalysisCv({ jobId: j.id, drafts: s.drafts.filter((d) => d.keep), cv })
    if (!res.ok) return fail(res.error, () => void save(cv))
    change((cur) => markSaved(cur, now()))
    setPhase('idle')
  }

  /** "Analyze another job": back to the link, nothing of this job is lost (it is saved with the job). */
  function reset(): void {
    jobRef.current = null
    sessionRef.current = null
    setJob(null)
    setSession(null)
    setPostingText('')
    setResumed(false)
    setSplit(null)
    setWhichJob(null)
    setModal(null)
    setUndo(null)
    setProblem(null)
    setNotice(null)
    window.history.replaceState(null, '', '/analyze')
  }

  const openNotMet = (reqId: string) => {
    setNotMet(NO_NOT_MET)
    setModal({ kind: 'notMet', reqId })
  }

  return {
    job, postingText, session, resumed, phase, problem, notice, experiences, modal, undo, notMet, split, whichJob, saveState: autosave,
    setModal, setUndo, setProblem, change, openNotMet, confirmPlacement, addExperience, reset, useAnotherLink,
    // Wrapped when called (from an event), never during render.
    start: (input: { urls: string[] } | { text: string }) => guard(start)(input),
    analyzePicked: (candidateId: string) => guard(analyzePicked)(candidateId),
    analyzeAgain: () => guard(analyzeAgain)(),
    redraft: (instruction: string | null = null) => guard(redraft)(instruction),
    updateDrafts: () => guard(updateDrafts)(),
    send: (askId: string) => guard(send)(askId),
    save: (cv: Parameters<typeof saveAnalysisCv>[0]['cv']) => guard(save)(cv),
  }
}

export type Analysis = ReturnType<typeof useAnalysis>

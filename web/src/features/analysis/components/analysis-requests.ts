// What the Job analysis flows send to the AI and to Experiences, taken from the session (pure; used by use-analysis).
import type { AnalysisSession, SentAnswer } from '../types'

export type SendItem = { askId: string; question: string; answer: string }

/** Every question's answer for the AI: "I don't have this" is null, unanswered is ''. */
export const answersFor = (s: AnalysisSession) =>
  s.analysis.asks.map((a) => ({ id: a.id, question: a.text, answer: s.dont[a.id] ? null : (s.answers[a.id] ?? '') }))

/** Drafts you edited by hand go back to the AI, so a redraft builds on them instead of replacing them (P2). */
export const draftsBrief = (s: AnalysisSession, all: boolean) =>
  s.drafts
    .filter((d) => all || d.editedByHand)
    .map((d) => ({ blockName: d.blockName, title: d.title, bullets: d.bullets.filter((b) => b.kind !== 'MISSING').map((b) => b.text) }))

export const dontSent = (question: string): SentAnswer => ({ question, answer: null, entry: null, experienceId: null, experienceTitle: '', isNewExperience: false, resent: false })

/** Written answers not sent yet. */
export const toSend = (s: AnalysisSession): SendItem[] =>
  s.analysis.asks
    .filter((a) => !s.dont[a.id] && !s.sent[a.id] && (s.answers[a.id] ?? '').trim())
    .map((a) => ({ askId: a.id, question: a.text, answer: (s.answers[a.id] ?? '').trim() }))

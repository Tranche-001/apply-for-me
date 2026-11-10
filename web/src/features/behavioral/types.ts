// What Behavioral and Interview mode work with (serializable), plus pure helpers (unit-tested).

export type QuestionItem = {
  id: string
  key: string
  n: string // "01"…"13"
  short: string
  full: string
  looksFor: string[]
  /** Your generalist answer in each language; each one is written by you, nothing is translated. */
  answers: Record<Lang, string>
  theory: string
  references: string[]
  useFounder: boolean
  founderNotes: string
  founderRefs: string[]
  /** Added by you on this screen (not one of the questions the app came with), so it can be deleted. */
  custom: boolean
}

/** Questions you add get a key with this prefix; the app's own questions keep their seed keys. */
export const CUSTOM_KEY_PREFIX = 'custom-'

export function isCustomKey(key: string): boolean {
  return key.startsWith(CUSTOM_KEY_PREFIX)
}

/** The language you answer in. Each language keeps its own answers; switching never translates. */
export type Lang = 'en' | 'pt'

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pt', label: 'Português' },
]

/** The language a view opens with: the one in the link (?lang=pt), else English. */
export function pickLang(wanted: string | null | undefined): Lang {
  return wanted === 'pt' ? 'pt' : 'en'
}

export function htmlLang(lang: Lang): string {
  return lang === 'pt' ? 'pt-BR' : 'en'
}

/** The database's name for a language (enum AnswerLang). */
export function dbLang(lang: Lang): 'EN' | 'PT' {
  return lang === 'pt' ? 'PT' : 'EN'
}

export function fromDbLang(lang: 'EN' | 'PT'): Lang {
  return lang === 'PT' ? 'pt' : 'en'
}

/** The link to a Behavioral view with the chosen job and language ("?job=…&lang=pt"; English is the default, left out). */
export function behavioralQuery(jobId: string | null, lang: Lang): string {
  const params = new URLSearchParams()
  if (jobId) params.set('job', jobId)
  if (lang !== 'en') params.set('lang', lang)
  const q = params.toString()
  return q ? `?${q}` : ''
}

/** Dragging `from` onto `to`: `from` takes `to`'s place and the rest keep their order. */
export function moveTo(ids: readonly string[], from: string, to: string): string[] {
  const at = ids.indexOf(to)
  if (from === to || at < 0 || !ids.includes(from)) return [...ids]
  const rest = ids.filter((id) => id !== from)
  return [...rest.slice(0, at), from, ...rest.slice(at)]
}

/** Alt+↑ / Alt+↓: one place up or down; nothing changes at the ends. */
export function moveBy(ids: readonly string[], id: string, delta: number): string[] {
  const at = ids.indexOf(id)
  const to = ids[at + delta]
  return at < 0 || to === undefined ? [...ids] : moveTo(ids, id, to)
}

/**
 * The questions in the order you dragged them (`order`), renumbered 01, 02…; questions not in `order` (just added)
 * keep their place at the end, and ids no longer there (deleted) are skipped.
 */
export function inOrder(questions: readonly QuestionItem[], order: readonly string[] | null): QuestionItem[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const ids = order ? [...order.filter((id) => byId.has(id)), ...questions.map((q) => q.id).filter((id) => !order.includes(id))] : questions.map((q) => q.id)
  return ids.map((id, i) => ({ ...byId.get(id)!, n: String(i + 1).padStart(2, '0') }))
}

export type JobOption = { id: string; label: string; company: string }

/** Adapted answers, keyed by tailoredKey(questionId, jobId, lang). */
export type TailoredMap = Record<string, string>

export type BehavioralData = { questions: QuestionItem[]; tailored: TailoredMap; jobs: JobOption[] }

export function tailoredKey(questionId: string, jobId: string, lang: Lang): string {
  return `${questionId}|${jobId}|${lang}`
}

/** How many jobs have an adapted answer for this question in this language. */
export function tailoredCount(tailored: TailoredMap, questionId: string, lang: Lang): number {
  return Object.entries(tailored).filter(([k, v]) => k.startsWith(`${questionId}|`) && k.endsWith(`|${lang}`) && v.trim()).length
}

/** "Answered · 2 job versions" / "Answered" / "Not started". */
export function questionStatus(answer: string, jobVersions: number): string {
  if (!answer.trim()) return jobVersions ? `Not started · ${jobVersions} job version${jobVersions > 1 ? 's' : ''}` : 'Not started'
  return jobVersions ? `Answered · ${jobVersions} job version${jobVersions > 1 ? 's' : ''}` : 'Answered'
}

export type CopyResult = { theory: string; references: string[]; notesAdded: boolean; refsAdded: number }

/** "Copy from the Founder": adds the Founder's notes and references to yours, never replacing, skipping duplicates. */
export function copyFounder(mine: { theory: string; references: string[] }, founder: { notes: string; refs: string[] }): CopyResult {
  const notes = founder.notes.trim()
  const hasNotes = !notes || mine.theory.includes(notes)
  const theory = hasNotes ? mine.theory : mine.theory.trim() ? `${mine.theory.trim()}\n\n${notes}` : notes
  const have = new Set(mine.references.map((r) => r.trim().toLowerCase()))
  const added = founder.refs.map((r) => r.trim()).filter((r) => r && !have.has(r.toLowerCase()))
  return { theory, references: [...mine.references, ...added], notesAdded: !hasNotes, refsAdded: added.length }
}

/** The line shown after copying, in words. */
export function copyMessage(c: Pick<CopyResult, 'notesAdded' | 'refsAdded'>): string {
  if (!c.notesAdded && !c.refsAdded) return 'The Founder’s notes and references are already in yours.'
  const parts = [c.notesAdded ? 'notes' : '', c.refsAdded ? `${c.refsAdded} ${c.refsAdded === 1 ? 'reference' : 'references'}` : '']
  return `Added the Founder’s ${parts.filter(Boolean).join(' and ')} to yours. Edit them as you like.`
}

export type InterviewItem = { id: string; n: string; short: string; full: string; answer: string; adapted: boolean; looksFor: string[] }

/** Interview mode: every question answered in this language, the job's adapted answer when there is one, else the generalist one. */
export function interviewItems(questions: QuestionItem[], tailored: TailoredMap, jobId: string | null, lang: Lang): InterviewItem[] {
  return questions
    .map((q) => {
      const adapted = jobId ? (tailored[tailoredKey(q.id, jobId, lang)] ?? '').trim() : ''
      const answer = adapted || q.answers[lang].trim()
      return { id: q.id, n: q.n, short: q.short, full: q.full, answer, adapted: Boolean(adapted), looksFor: q.looksFor }
    })
    .filter((x) => x.answer)
}

/** The job a view opens with: the one in the link if it exists, else the first. */
export function pickJob(jobs: JobOption[], wanted: string | null | undefined): string | null {
  if (wanted && jobs.some((j) => j.id === wanted)) return wanted
  return jobs[0]?.id ?? null
}

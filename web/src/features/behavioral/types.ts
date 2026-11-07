// What Behavioral and Interview mode work with (serializable), plus pure helpers (unit-tested).

export type QuestionItem = {
  id: string
  key: string
  n: string // "01"…"13"
  short: string
  full: string
  looksFor: string[]
  answer: string
  theory: string
  references: string[]
  useFounder: boolean
  founderNotes: string
  founderRefs: string[]
}

export type JobOption = { id: string; label: string; company: string }

/** Adapted answers, keyed by tailoredKey(questionId, jobId). */
export type TailoredMap = Record<string, string>

export type BehavioralData = { questions: QuestionItem[]; tailored: TailoredMap; jobs: JobOption[] }

export function tailoredKey(questionId: string, jobId: string): string {
  return `${questionId}|${jobId}`
}

/** How many jobs have an adapted answer for this question. */
export function tailoredCount(tailored: TailoredMap, questionId: string): number {
  return Object.entries(tailored).filter(([k, v]) => k.startsWith(`${questionId}|`) && v.trim()).length
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

/** Interview mode: every answered question, the job's adapted answer when there is one, else the generalist one. */
export function interviewItems(questions: QuestionItem[], tailored: TailoredMap, jobId: string | null): InterviewItem[] {
  return questions
    .map((q) => {
      const adapted = jobId ? (tailored[tailoredKey(q.id, jobId)] ?? '').trim() : ''
      const answer = adapted || q.answer.trim()
      return { id: q.id, n: q.n, short: q.short, full: q.full, answer, adapted: Boolean(adapted), looksFor: q.looksFor }
    })
    .filter((x) => x.answer)
}

/** The job a view opens with: the one in the link if it exists, else the first. */
export function pickJob(jobs: JobOption[], wanted: string | null | undefined): string | null {
  if (wanted && jobs.some((j) => j.id === wanted)) return wanted
  return jobs[0]?.id ?? null
}

// What the Experiences screen works with (serializable, shared by server and client).

export type ExperienceItem = {
  id: string
  title: string
  where: string
  when: string
  notes: string
  blocks: { id: string; name: string }[]
}

export type ExperienceFields = Pick<ExperienceItem, 'id' | 'title' | 'where' | 'when' | 'notes'>

/** Chips that start a line in the notes (the canvas "Add a prompt"). */
export const PROMPTS = ['Something I did', 'Feedback I got', 'A situation', 'A number or result', 'What was hard'] as const

/** Search over title, place, dates and notes, case-insensitive. */
export function matchesExperience(item: ExperienceItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [item.title, item.where, item.when, item.notes].join(' ').toLowerCase().includes(q)
}

/** Appends "Label: " on its own paragraph, ready to type after. */
export function appendPrompt(notes: string, label: string): string {
  const body = notes.replace(/\s+$/, '')
  return `${body ? `${body}\n\n` : ''}${label}: `
}

/** The experience that collects answers when no place fits (created the first time it is needed). */
export const ANSWERS_TITLE = 'Answers to the AI’s questions'

/** One answer to an AI question, as it is written into an experience's notes. */
export function answerEntry(input: { jobLabel: string; question: string; answer: string }): string {
  return `For ${input.jobLabel.trim()}\nThe AI asked: ${input.question.trim()}\nMy answer: ${input.answer.trim()}`
}

/**
 * The notes with `entry` added as a new paragraph at the end. What was there stays exactly as it was
 * (it is never rewritten or trimmed); already there word for word → the notes come back unchanged.
 */
export function appendEntry(notes: string, entry: string): string {
  if (!notes) return entry
  if (notes.includes(entry)) return notes
  const gap = notes.endsWith('\n\n') ? '' : notes.endsWith('\n') ? '\n' : '\n\n'
  return `${notes}${gap}${entry}`
}

/**
 * Resend: the first exact occurrence of `oldEntry` becomes `newEntry`; everything else stays byte for byte.
 * Not found (edited by hand, or empty) → `newEntry` is appended at the end like appendEntry, `replaced: false`.
 */
export function replaceEntry(notes: string, oldEntry: string, newEntry: string): { notes: string; replaced: boolean } {
  const at = oldEntry ? notes.indexOf(oldEntry) : -1
  if (at < 0) return { notes: appendEntry(notes, newEntry), replaced: false }
  return { notes: `${notes.slice(0, at)}${newEntry}${notes.slice(at + oldEntry.length)}`, replaced: true }
}

const BLANK_LINES = ['\r\n\r\n', '\n\n'] as const

/**
 * The first exact occurrence of `entry` is removed together with ONE blank-line separator: the one right
 * before it, or the one right after it when nothing precedes it. Nothing else changes. Not found → unchanged.
 */
export function removeEntry(notes: string, entry: string): { notes: string; removed: boolean } {
  const at = entry ? notes.indexOf(entry) : -1
  if (at < 0) return { notes, removed: false }
  let before = notes.slice(0, at)
  let after = notes.slice(at + entry.length)
  const gapBefore = BLANK_LINES.find((g) => before.endsWith(g))
  if (gapBefore) before = before.slice(0, -gapBefore.length)
  else if (!before) {
    const gapAfter = BLANK_LINES.find((g) => after.startsWith(g))
    if (gapAfter) after = after.slice(gapAfter.length)
  }
  return { notes: `${before}${after}`, removed: true }
}

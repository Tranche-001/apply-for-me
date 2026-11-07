import 'server-only'
// Writes an answer to an AI question into Experiences: at the end of the chosen experience's notes,
// in a NEW experience when the caller asks for one, or in "Answers to the AI's questions" when none is
// chosen (or it was deleted meanwhile). Appending never changes what you wrote before (appendEntry);
// resending replaces only the exact text this question wrote (replaceEntry / removeEntry).
import type { Prisma } from '@prisma/client'
import { ANSWERS_TITLE, appendEntry, removeEntry, replaceEntry } from './types'

export type PlacedAnswer = { experienceId: string; title: string; added: boolean; entry: string; isNew: boolean }

export type ResentAnswer = { experienceId: string; title: string; entry: string | null; replaced: boolean }

const PLACE = { id: true, title: true, notes: true } as const

async function createAtEnd(tx: Prisma.TransactionClient, title: string, notes: string) {
  const last = await tx.experience.aggregate({ _max: { position: true } })
  return tx.experience.create({ data: { title, notes, position: (last._max.position ?? -1) + 1 }, select: { id: true, title: true } })
}

export async function appendAnswerToExperience(
  tx: Prisma.TransactionClient,
  experienceId: string | null,
  entry: string,
  options: { newExperienceTitle?: string | null } = {},
): Promise<PlacedAnswer> {
  const chosen = experienceId ? await tx.experience.findUnique({ where: { id: experienceId }, select: PLACE }) : null
  const wantedTitle = options.newExperienceTitle?.trim()
  if (!chosen && !experienceId && wantedTitle) {
    const created = await createAtEnd(tx, wantedTitle, entry)
    return { experienceId: created.id, title: created.title, added: true, entry, isNew: true }
  }
  const place = chosen ?? (await tx.experience.findFirst({ where: { title: ANSWERS_TITLE }, orderBy: { createdAt: 'asc' }, select: PLACE }))
  if (!place) {
    const created = await createAtEnd(tx, ANSWERS_TITLE, entry)
    return { experienceId: created.id, title: created.title, added: true, entry, isNew: true }
  }
  const notes = appendEntry(place.notes, entry)
  const added = notes !== place.notes
  if (added) await tx.experience.update({ where: { id: place.id }, data: { notes } })
  return { experienceId: place.id, title: place.title, added, entry, isNew: false }
}

/**
 * An answer is sent again (changed, or cleared with `newEntry: null`): only the text `oldEntry` is replaced
 * (or removed with one blank line); the rest of the notes stays byte for byte. If the old text can't be found
 * the new entry is appended at the end. If the experience was deleted, the new entry goes to
 * "Answers to the AI's questions"; removing from a deleted experience does nothing.
 */
export async function resendAnswerInExperience(
  tx: Prisma.TransactionClient,
  input: { experienceId: string; oldEntry: string; newEntry: string | null },
): Promise<ResentAnswer> {
  const { experienceId, oldEntry, newEntry } = input
  const place = await tx.experience.findUnique({ where: { id: experienceId }, select: PLACE })
  if (!place) {
    if (newEntry === null) return { experienceId, title: '', entry: null, replaced: false }
    const placed = await appendAnswerToExperience(tx, null, newEntry)
    return { experienceId: placed.experienceId, title: placed.title, entry: newEntry, replaced: false }
  }
  let notes: string
  let replaced: boolean
  if (newEntry === null) {
    const res = removeEntry(place.notes, oldEntry)
    notes = res.notes
    replaced = res.removed
  } else {
    const res = replaceEntry(place.notes, oldEntry, newEntry)
    notes = res.notes
    replaced = res.replaced
  }
  if (notes !== place.notes) await tx.experience.update({ where: { id: place.id }, data: { notes } })
  return { experienceId: place.id, title: place.title, entry: newEntry, replaced }
}

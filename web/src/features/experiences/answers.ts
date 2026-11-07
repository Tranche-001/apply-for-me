import 'server-only'
// Writes an answer to an AI question into Experiences: at the end of the chosen experience's notes,
// or of "Answers to the AI's questions" when none is chosen (or it was deleted meanwhile).
// Only ever appends: what you wrote before is never changed (appendEntry).
import type { Prisma } from '@prisma/client'
import { ANSWERS_TITLE, appendEntry } from './types'

export type PlacedAnswer = { experienceId: string; title: string; added: boolean }

const PLACE = { id: true, title: true, notes: true } as const

export async function appendAnswerToExperience(tx: Prisma.TransactionClient, experienceId: string | null, entry: string): Promise<PlacedAnswer> {
  const chosen = experienceId ? await tx.experience.findUnique({ where: { id: experienceId }, select: PLACE }) : null
  const place = chosen ?? (await tx.experience.findFirst({ where: { title: ANSWERS_TITLE }, orderBy: { createdAt: 'asc' }, select: PLACE }))
  if (!place) {
    const last = await tx.experience.aggregate({ _max: { position: true } })
    const created = await tx.experience.create({
      data: { title: ANSWERS_TITLE, notes: entry, position: (last._max.position ?? -1) + 1 },
      select: { id: true, title: true },
    })
    return { experienceId: created.id, title: created.title, added: true }
  }
  const notes = appendEntry(place.notes, entry)
  const added = notes !== place.notes
  if (added) await tx.experience.update({ where: { id: place.id }, data: { notes } })
  return { experienceId: place.id, title: place.title, added }
}

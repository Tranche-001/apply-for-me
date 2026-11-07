import 'server-only'
import { db } from '@/lib/db'
import type { ExperienceItem } from './types'

export async function listExperiences(): Promise<ExperienceItem[]> {
  const rows = await db.experience.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { blocks: { select: { id: true, name: true }, orderBy: { position: 'asc' } } },
  })
  return rows.map((e) => ({ id: e.id, title: e.title, where: e.where, when: e.when, notes: e.notes, blocks: e.blocks }))
}

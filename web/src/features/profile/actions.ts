'use server'

// Profile writes: each text field autosaves on its own; add, remove (with Undo) and reorder.
import { refresh } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { idSchema } from '@/features/blocks/schemas'
import { UserError, fail, firstIssue, guarded, type ActionResult } from '@/features/cv/action-result'
import type { AchievementItem, EducationItem, ProfileKind, SkillItem } from './types'

type Tx = Prisma.TransactionClient
type AnyItem = EducationItem | SkillItem | AchievementItem

const kindSchema = z.enum(['education', 'skills', 'achievements'])
const text = z.string().max(600, 'Keep it under 600 characters.')

const fieldsSchema = {
  education: z.object({ degree: text, dates: text, school: text, location: text }).partial(),
  skills: z.object({ label: text, text: z.string().max(1200) }).partial(),
  achievements: z.object({ title: text, description: text }).partial(),
} as const

const BLANK = {
  education: { degree: '', dates: '', school: '', location: '' },
  skills: { label: '', text: '' },
  achievements: { title: '', description: '' },
} as const

async function positions(tx: Tx, kind: ProfileKind): Promise<{ id: string }[]> {
  const args = { orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }], select: { id: true } }
  if (kind === 'education') return tx.educationEntry.findMany(args)
  if (kind === 'skills') return tx.skillLine.findMany(args)
  return tx.achievement.findMany(args)
}

async function setPosition(tx: Tx, kind: ProfileKind, id: string, position: number): Promise<void> {
  if (kind === 'education') await tx.educationEntry.update({ where: { id }, data: { position } })
  else if (kind === 'skills') await tx.skillLine.update({ where: { id }, data: { position } })
  else await tx.achievement.update({ where: { id }, data: { position } })
}

async function renumber(tx: Tx, kind: ProfileKind, ids: string[]): Promise<void> {
  for (const [position, id] of ids.entries()) await setPosition(tx, kind, id, position)
}

async function create(tx: Tx, kind: ProfileKind, values: Record<string, string>, position: number): Promise<AnyItem> {
  if (kind === 'education') {
    const v = { ...BLANK.education, ...fieldsSchema.education.parse(values) }
    const x = await tx.educationEntry.create({ data: { ...v, position } })
    return { id: x.id, degree: x.degree, dates: x.dates, school: x.school, location: x.location }
  }
  if (kind === 'skills') {
    const v = { ...BLANK.skills, ...fieldsSchema.skills.parse(values) }
    const x = await tx.skillLine.create({ data: { ...v, position } })
    return { id: x.id, label: x.label, text: x.text }
  }
  const v = { ...BLANK.achievements, ...fieldsSchema.achievements.parse(values) }
  const x = await tx.achievement.create({ data: { ...v, position } })
  return { id: x.id, title: x.title, description: x.description }
}

const updateSchema = z.object({ kind: kindSchema, id: idSchema, values: z.record(z.string(), z.string()) })

/** Autosave: the fields you changed on one item. */
export async function updateProfileItem(input: z.input<typeof updateSchema>): Promise<ActionResult<null>> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { kind, id, values } = parsed.data
  const fields = fieldsSchema[kind].safeParse(values)
  if (!fields.success) return fail(firstIssue(fields.error))
  const data = Object.fromEntries(Object.entries(fields.data).filter(([key]) => key in BLANK[kind]))
  const result = await guarded('updateProfileItem', 'Couldn’t save. What you typed is still here; it will try again.', async () => {
    const found =
      kind === 'education'
        ? await db.educationEntry.updateMany({ where: { id }, data })
        : kind === 'skills'
          ? await db.skillLine.updateMany({ where: { id }, data })
          : await db.achievement.updateMany({ where: { id }, data })
    if (!found.count) throw new UserError('That item was removed. Reload to see your profile as saved.')
    return null
  })
  if (result.ok) refresh()
  return result
}

const addSchema = z.object({ kind: kindSchema })

export async function addProfileItem(input: z.input<typeof addSchema>): Promise<ActionResult<AnyItem>> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { kind } = parsed.data
  const result = await guarded('addProfileItem', 'Couldn’t add it. Try again.', () =>
    db.$transaction(async (tx) => create(tx, kind, {}, (await positions(tx, kind)).length)),
  )
  if (result.ok) refresh()
  return result
}

const removeSchema = z.object({ kind: kindSchema, id: idSchema })

export async function removeProfileItem(input: z.input<typeof removeSchema>): Promise<ActionResult<null>> {
  const parsed = removeSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { kind, id } = parsed.data
  const result = await guarded('removeProfileItem', 'Couldn’t remove it. Try again.', async () => {
    if (kind === 'education') await db.educationEntry.deleteMany({ where: { id } })
    else if (kind === 'skills') await db.skillLine.deleteMany({ where: { id } })
    else await db.achievement.deleteMany({ where: { id } })
    return null
  })
  if (result.ok) refresh()
  return result
}

const restoreSchema = z.object({ kind: kindSchema, index: z.number().int().min(0).max(500), values: z.record(z.string(), z.string()) })

/** Undo a removal: the item comes back where it was. */
export async function restoreProfileItem(input: z.input<typeof restoreSchema>): Promise<ActionResult<AnyItem>> {
  const parsed = restoreSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { kind, index, values } = parsed.data
  const result = await guarded('restoreProfileItem', 'Couldn’t undo. Add it again by hand.', () =>
    db.$transaction(async (tx) => {
      const ids = (await positions(tx, kind)).map((x) => x.id)
      const item = await create(tx, kind, values, ids.length)
      const at = Math.min(index, ids.length)
      await renumber(tx, kind, [...ids.slice(0, at), item.id, ...ids.slice(at)])
      return item
    }),
  )
  if (result.ok) refresh()
  return result
}

const reorderSchema = z.object({ kind: kindSchema, ids: z.array(idSchema).max(500) })

export async function reorderProfile(input: z.input<typeof reorderSchema>): Promise<ActionResult<null>> {
  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return fail(firstIssue(parsed.error))
  const { kind, ids } = parsed.data
  const result = await guarded('reorderProfile', 'Couldn’t save the new order. Try again.', () =>
    db.$transaction(async (tx) => {
      await renumber(tx, kind, ids)
      return null
    }),
  )
  if (result.ok) refresh()
  return result
}

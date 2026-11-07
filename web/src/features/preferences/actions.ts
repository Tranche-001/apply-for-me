'use server'

// Style rules: switch on/off, add your own, delete (the screen offers Undo, which adds it back).
import { refresh } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { dbLogContext, plainDbError } from '../ai/db-errors'
import { fail, invalidInput, ok, type ActionResult } from '../ai/result'
import type { RuleItem } from './types'

const id = z.string().trim().min(1, 'is missing').max(64, 'is not a valid id')
const ruleText = z.string().trim().min(1, 'Write the rule first.').max(500, 'A rule is at most 500 characters. Keep it to one instruction.')
const group = z.enum(['cv', 'qa'])

async function attempt<T>(what: string, work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work()
    refresh()
    return ok(data)
  } catch (err) {
    console.error(`[preferences] ${what} failed`, dbLogContext(err))
    return fail(plainDbError(err))
  }
}

export async function setRuleOn(input: { id: string; on: boolean }): Promise<ActionResult<null>> {
  const parsed = z.object({ id, on: z.boolean() }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  return attempt('setRuleOn', async () => {
    await db.preferenceRule.update({ where: { id: parsed.data.id }, data: { on: parsed.data.on } })
    return null
  })
}

const addInput = z.object({
  group,
  text: ruleText,
  source: z.string().trim().max(200).optional(),
  on: z.boolean().optional(),
  position: z.number().int().min(-1_000_000).max(1_000_000).optional(),
})

/** "Add rule" (and Undo of a delete, which passes the old source, state and position back). */
export async function addRule(input: { group: string; text: string; source?: string; on?: boolean; position?: number }): Promise<ActionResult<RuleItem>> {
  const parsed = addInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const { text, source = 'You added this', on = true } = parsed.data
  return attempt('addRule', async () => {
    const last = await db.preferenceRule.findFirst({ orderBy: { position: 'desc' }, select: { position: true } })
    const position = parsed.data.position ?? (last?.position ?? -1) + 1
    const r = await db.preferenceRule.create({ data: { group: parsed.data.group, text, source, on, position } })
    return { id: r.id, group: r.group, text: r.text, source: r.source, on: r.on, position: r.position }
  })
}

export async function deleteRule(input: { id: string }): Promise<ActionResult<null>> {
  const parsed = z.object({ id }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  return attempt('deleteRule', async () => {
    await db.preferenceRule.delete({ where: { id: parsed.data.id } })
    return null
  })
}

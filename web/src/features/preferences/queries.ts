import 'server-only'
import { db } from '@/lib/db'
import type { RuleItem } from './types'

export async function listRules(): Promise<RuleItem[]> {
  const rules = await db.preferenceRule.findMany({ orderBy: [{ position: 'asc' }] })
  return rules.map((r) => ({ id: r.id, group: r.group, text: r.text, source: r.source, on: r.on, position: r.position }))
}

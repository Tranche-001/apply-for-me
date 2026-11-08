// Style rules the AI follows, grouped by what they apply to.

export type RuleItem = { id: string; group: string; text: string; source: string; on: boolean; position: number }

/** "cv" rules go into block and CV prompts; "qa" rules into interview answers. */
export const GROUPS = [
  { id: 'cv', name: 'Blocks and CVs' },
  { id: 'qa', name: 'Interview answers' },
] as const

export type GroupId = (typeof GROUPS)[number]['id']

/** A rule written from something you asked for while using the app ("From your request on Nov 8"): tagged "Learned from use". */
export const isLearnedFromUse = (source: string): boolean => /^From your request\b/.test(source.trim())

/** Known groups first, in their order, then any other group found in the data. */
export function groupRules(rules: RuleItem[]): { id: string; name: string; rules: RuleItem[] }[] {
  const known = GROUPS.map((g) => ({ id: g.id as string, name: g.name as string, rules: rules.filter((r) => r.group === g.id) }))
  const others = [...new Set(rules.map((r) => r.group))]
    .filter((g) => !GROUPS.some((k) => k.id === g))
    .map((g) => ({ id: g, name: g, rules: rules.filter((r) => r.group === g) }))
  return [...known, ...others]
}

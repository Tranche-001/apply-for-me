// Style rules the AI follows, grouped by what they apply to.

export type RuleItem = { id: string; group: string; text: string; source: string; on: boolean; position: number }

/** "cv" rules go into block and CV prompts; "qa" rules into interview answers. */
export const GROUPS = [
  { id: 'cv', name: 'Blocks and CVs' },
  { id: 'qa', name: 'Interview answers' },
] as const

export type GroupId = (typeof GROUPS)[number]['id']

/**
 * Where a rule came from, by its source line: `learned` = the app wrote it while you used it ("From your request on
 * Nov 8", "Learned from your review of iFood · AI Builder", "From 1 edit"); `you` = "You added this"; `app` = it came
 * with the app (the seed, e.g. "From your LaTeX CVs").
 */
export type RuleOrigin = 'learned' | 'app' | 'you'

const LEARNED_SOURCES = [/^From your request\b/i, /^Learned from your review\b/i, /^From \d+ edits?\b/i]

export function ruleOrigin(source: string): RuleOrigin {
  const s = source.trim()
  if (LEARNED_SOURCES.some((re) => re.test(s))) return 'learned'
  return /^You added this\b/i.test(s) ? 'you' : 'app'
}

/** Tagged "Learned from use" on Preferences. */
export const isLearnedFromUse = (source: string): boolean => ruleOrigin(source) === 'learned'

/** "Show: All / Learned from use / Came with the app" on Preferences. */
export type RuleFilter = 'all' | 'learned' | 'app'
export const RULE_FILTERS: { id: RuleFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'learned', label: 'Learned from use' },
  { id: 'app', label: 'Came with the app' },
]

export const filterRules = (rules: readonly RuleItem[], show: RuleFilter): RuleItem[] => (show === 'all' ? [...rules] : rules.filter((r) => ruleOrigin(r.source) === show))

const MAX_SOURCE = 200
export const MAX_RULE_TEXT = 500
const MAX_LEARNED_RULES = 3

/** The source of a rule learned from "Remember this for next CVs" on REVIEW. */
export const reviewRuleSource = (jobLabel: string): string => `Learned from your review of ${jobLabel.trim()}`.slice(0, MAX_SOURCE)

/** A rule's text as rules are compared: case, spacing, curly quotes and the final stop do not count. */
const ruleKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!;]+$/, '')
    .trim()

/** The texts worth saving as new rules: trimmed, not empty, not one a rule already has, each once, at most 3. */
export function newRuleTexts(candidates: readonly string[], existing: readonly string[]): string[] {
  const seen = new Set(existing.map(ruleKey))
  const out: string[] = []
  for (const raw of candidates) {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_RULE_TEXT)
    const key = ruleKey(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out.slice(0, MAX_LEARNED_RULES)
}

/** Known groups first, in their order, then any other group found in the data. */
export function groupRules(rules: RuleItem[]): { id: string; name: string; rules: RuleItem[] }[] {
  const known = GROUPS.map((g) => ({ id: g.id as string, name: g.name as string, rules: rules.filter((r) => r.group === g.id) }))
  const others = [...new Set(rules.map((r) => r.group))]
    .filter((g) => !GROUPS.some((k) => k.id === g))
    .map((g) => ({ id: g, name: g, rules: rules.filter((r) => r.group === g) }))
  return [...known, ...others]
}

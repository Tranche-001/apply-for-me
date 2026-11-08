// Which block of the CV something is about, the same way in the AI's order, its role titles, the title you
// pick and the redraft: a library block by its id, a new block (no id until Save) by its name.
const NEW_PREFIX = 'new:'

/** The key of a new block: `new:` and its name, trimmed and in lower case. */
export const newBlockKey = (name: string): string => `${NEW_PREFIX}${name.trim().toLowerCase()}`

/** The key of the block a draft is for. */
export function blockKey(d: { blockId: string | null; newBlock: { name: string } | null }): string {
  return d.blockId ?? newBlockKey(d.newBlock?.name ?? '')
}

/**
 * `items` in the order `order` gives their keys: unknown keys and repeats in `order` are ignored, and items it does
 * not name follow in their current order. No order (a session saved before the AI gave one) leaves them as they are.
 */
export function inOrder<T>(items: readonly T[], keyOf: (item: T) => string, order: readonly string[] | undefined): T[] {
  if (!order) return [...items]
  const rank = new Map<string, number>()
  for (const key of order) if (!rank.has(key)) rank.set(key, rank.size)
  const named = items.filter((item) => rank.has(keyOf(item))).sort((a, b) => rank.get(keyOf(a))! - rank.get(keyOf(b))!)
  return [...named, ...items.filter((item) => !rank.has(keyOf(item)))]
}

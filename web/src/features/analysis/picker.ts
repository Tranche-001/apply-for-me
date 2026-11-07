// Which experiences the "Goes to" picker shows, and in which groups.

export type PickerExperience = { id: string; title: string }
export type SuggestedExperience = PickerExperience & { tag: 'ai' | 'also' }

export type PickerGroups = { suggested: SuggestedExperience[]; rest: PickerExperience[]; empty: boolean }

/**
 * AI pick first, then "also fits", then every other experience A-Z. A search hides the suggested group
 * and filters all experiences by title (case-insensitive); `empty` means nothing is shown.
 */
export function pickerGroups(input: { all: readonly PickerExperience[]; aiPick: string | null; alsoFits: readonly string[]; query: string }): PickerGroups {
  const { all, aiPick, alsoFits } = input
  const query = input.query.trim().toLowerCase()
  const byId = new Map(all.map((e) => [e.id, e]))
  const seen = new Set<string>()
  const suggested: SuggestedExperience[] = []
  const tagged: [string | null, 'ai' | 'also'][] = [[aiPick, 'ai'], ...alsoFits.map((id): [string, 'also'] => [id, 'also'])]
  for (const [id, tag] of tagged) {
    const found = id ? byId.get(id) : undefined
    if (!found || seen.has(found.id)) continue
    seen.add(found.id)
    suggested.push({ ...found, tag })
  }
  const matches = (e: PickerExperience) => !query || e.title.toLowerCase().includes(query)
  const rest = all
    .filter((e) => (query ? true : !seen.has(e.id)) && matches(e))
    .map((e) => ({ id: e.id, title: e.title }))
    .sort((a, b) => a.title.localeCompare(b.title))
  return { suggested: query ? [] : suggested, rest, empty: query ? rest.length === 0 : rest.length === 0 && suggested.length === 0 }
}

/** The name for a new experience: the typed text when no experience matches it, else nothing. */
export function newNameFromQuery(query: string, anyMatch: boolean): string {
  return anyMatch ? '' : query.trim()
}

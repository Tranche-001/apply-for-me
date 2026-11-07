// Names for things the app creates from a draft. Pure, unit-tested.

/** "Study Rats!" → "study-rats". Accents are folded so slugs stay ASCII. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'block'
}

/** `wanted` if free, else "wanted 2", "wanted 3"… (case-insensitive). No "Copy of Copy of…". */
export function nextFreeName(wanted: string, taken: string[], separator = ' '): string {
  const used = new Set(taken.map((t) => t.toLowerCase()))
  const base = wanted.trim() || 'Untitled'
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}${separator}${n}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

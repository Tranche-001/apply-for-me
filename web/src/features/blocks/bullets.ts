// Bullet kinds, the P / S / I tags, and the "like the CV" editor's draft ↔ version conversion.
import type { BulletKind } from '@prisma/client'
import type { BulletData, LibBlock, LibVersion } from './types'

export type PrintableKind = Exclude<BulletKind, 'MISSING'>

export const KIND_OPTIONS: { value: PrintableKind; label: string; name: string }[] = [
  { value: 'PROJECT', label: 'P', name: 'Project' },
  { value: 'STACK', label: 'S', name: 'Stack' },
  { value: 'IMPACT', label: 'I', name: 'Impact' },
  { value: 'PROJECT_STACK', label: 'P·S', name: 'Project · stack' },
  { value: 'PROJECT_IMPACT', label: 'P·I', name: 'Project · impact' },
  { value: 'STACK_IMPACT', label: 'S·I', name: 'Stack · impact' },
]

const ABBR: Record<PrintableKind, string> = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.label])) as Record<PrintableKind, string>
const NAME: Record<PrintableKind, string> = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.name])) as Record<PrintableKind, string>

export function printable(kind: BulletKind | null | undefined, fallback: PrintableKind = 'IMPACT'): PrintableKind {
  return kind && kind !== 'MISSING' ? kind : fallback
}

/** "P", "S·I", or "I?" for a gap. */
export function kindAbbr(b: Pick<BulletData, 'kind' | 'want'>): string {
  if (b.kind === 'MISSING') return `${ABBR[printable(b.want)] ?? 'I'}?`
  return ABBR[b.kind]
}

export function kindName(kind: PrintableKind): string {
  return NAME[kind]
}

/** Colors of the P / S / I tag, the same on every screen (H4). */
export function kindTone(kind: BulletKind): { background: string; color: string; border?: string } {
  if (kind === 'MISSING') return { background: '#FFFFFF', color: '#8A4300', border: '1px dashed #D9A35B' }
  if (kind.startsWith('PROJECT')) return { background: '#EEF0FE', color: '#3730A3' }
  if (kind === 'STACK') return { background: '#EEF1F5', color: '#334155' }
  if (kind === 'IMPACT') return { background: '#E7F5EC', color: '#14632F' }
  return { background: '#E6F3F1', color: '#115E59' }
}

/** One bullet in the editor. A gap keeps `want` and its note; left empty, it stays a gap (P1). */
export type EditorBullet = { id: string; kind: PrintableKind; text: string; want: PrintableKind | null; gapText: string }

export type EditorDraft = { title: string; bullets: EditorBullet[] }

export function toEditorBullets(bullets: readonly BulletData[], makeId: (index: number) => string): EditorBullet[] {
  return bullets.map((b, i) =>
    b.kind === 'MISSING'
      ? { id: makeId(i), kind: printable(b.want), text: '', want: printable(b.want), gapText: b.text }
      : { id: makeId(i), kind: b.kind, text: b.text, want: null, gapText: '' },
  )
}

export function blankBullet(id: string, kind: PrintableKind): EditorBullet {
  return { id, kind, text: '', want: null, gapText: '' }
}

/** A bullet as it is stored: written text, or a gap that names the missing kind. */
export type StoredBullet = { kind: PrintableKind; text: string; want: null } | { kind: 'MISSING'; text: string; want: PrintableKind }

/** The bullets to store: a written bullet keeps its text; an empty gap stays a gap; other empty bullets are dropped. */
export function fromEditorBullets(bullets: readonly EditorBullet[]): StoredBullet[] {
  return bullets
    .filter((b) => b.text.trim() || b.want)
    .map((b): StoredBullet => {
      if (b.text.trim()) return { kind: b.kind, text: b.text.trim(), want: null }
      const want = b.want ?? 'IMPACT'
      return { kind: 'MISSING', text: b.gapText || `No ${kindName(want).toLowerCase()} bullet yet.`, want }
    })
}

/** The version as it would print with this draft (title falls back to the version's or the block's name). */
export function draftVersion<V extends { title: string; bullets: BulletData[] }>(version: V, draft: EditorDraft, fallbackTitle: string): V {
  return { ...version, title: draft.title.trim() || version.title || fallbackTitle, bullets: fromEditorBullets(draft.bullets) }
}

function contentKey(v: { title: string; bullets: readonly BulletData[] }): string {
  return JSON.stringify([v.title, v.bullets.map((b) => (b.kind === 'MISSING' ? ['MISSING', b.want] : [b.kind, b.text]))])
}

/** Whether the draft would change what the version holds. */
export function draftChanged(version: { title: string; bullets: BulletData[] }, draft: EditorDraft): boolean {
  return contentKey(draftVersion(version, draft, version.title)) !== contentKey(version)
}

/** Same title and the same printed bullet texts: a copy nobody changed. */
export function samePrintedText(a: { title: string; bullets: readonly BulletData[] }, b: { title: string; bullets: readonly BulletData[] }): boolean {
  const texts = (v: { bullets: readonly BulletData[] }) => v.bullets.filter((x) => x.kind !== 'MISSING').map((x) => x.text.trim())
  const ta = texts(a)
  const tb = texts(b)
  return a.title.trim() === b.title.trim() && ta.length === tb.length && ta.every((t, i) => t === tb[i])
}

/** The italic line under a block's title: organization · place · dates, or the stack of a project. */
export function blockContext(block: Pick<LibBlock, 'section' | 'org' | 'location' | 'dates' | 'stack'>): string {
  if (block.section === 'PROJECT') return block.stack
  return [block.org, block.location, block.dates].filter(Boolean).join(' · ')
}

/** A version identical to an earlier one is flagged, so it can be merged (H5, P3). */
export function identicalTo(version: LibVersion, versions: readonly LibVersion[]): LibVersion | null {
  const idx = versions.findIndex((v) => v.id === version.id)
  if (idx <= 0) return null
  return versions.slice(0, idx).find((v) => samePrintedText(v, version) && v.bullets.length === version.bullets.length) ?? null
}

/** A name for a new version that no other version of the block uses ("JackBox", then "JackBox 2"). */
export function uniqueName(base: string, taken: readonly string[]): string {
  const wanted = base.trim() || 'Untitled version'
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  if (!lower.has(wanted.toLowerCase())) return wanted
  let k = 2
  while (lower.has(`${wanted} ${k}`.toLowerCase())) k += 1
  return `${wanted} ${k}`
}

/** Base first, then the most used, then library order (decision log: version picker). */
export function pickerOrder(versions: readonly LibVersion[]): LibVersion[] {
  return [...versions].sort((a, b) => {
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1
    return b.jobIds.length - a.jobIds.length || a.position - b.position
  })
}

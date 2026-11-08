// His profile (Education, Technical Skills, Leadership & Achievements) as evidence for a job's requirements.
// Pure: items with short ids for the prompt, then the AI's matches checked against those items (P1: a phrase is kept
// only when it is in that item, word for word; unknown items and requirements are dropped).
import type { ProfileContext } from './context-types'
import { findWording } from './postprocess'
import { fenceData } from './prompts'
import type { JobRequirement, ProfileEvidence, ProfileKind } from './types'

export type ProfileItem = { id: string; kind: ProfileKind; title: string; dates: string; detail: string }

type RawProfileMatch = { requirementId: string; itemId: string; phrases: string[]; partly: boolean }

const MIN_PHRASE_CHARS = 3
const MAX_PHRASES = 10
const joined = (parts: string[]): string => parts.map((p) => p.trim()).filter(Boolean).join(' · ')

/** Every profile entry as an item: e1, e2… for Education, s1… for skills, a1… for achievements. */
export function profileItems(p: ProfileContext): ProfileItem[] {
  return [
    ...p.education.map((e, i) => ({ id: `e${i + 1}`, kind: 'education' as const, title: e.degree.trim(), dates: e.dates.trim(), detail: joined([e.school, e.location]) })),
    ...p.skills.map((s, i) => ({ id: `s${i + 1}`, kind: 'skills' as const, title: s.label.trim(), dates: '', detail: s.text.trim() })),
    ...p.achievements.map((a, i) => ({ id: `a${i + 1}`, kind: 'achievement' as const, title: a.title.trim(), dates: '', detail: a.description.trim() })),
  ]
}

const TAG: Record<ProfileKind, string> = { education: 'education', skills: 'skills', achievement: 'achievement' }

/** The items inside a <profile> fence: his own data, never instructions; a tag inside cannot close the fence. */
export function formatProfileItems(items: readonly ProfileItem[]): string {
  if (!items.length) return '<profile>\n(empty)\n</profile>'
  const body = items.map((i) => `<${TAG[i.kind]} id="${i.id}">${fenceData([i.title, i.dates, i.detail].filter(Boolean).join(' · '))}</${TAG[i.kind]}>`)
  return `<profile>\n${body.join('\n')}\n</profile>`
}

/** A phrase as the item writes it, looked up in each of its fields (never across two fields). */
function inItem(item: ProfileItem, phrase: string): string | null {
  for (const field of [item.title, item.dates, item.detail]) {
    const found = findWording(field, phrase, { minChars: MIN_PHRASE_CHARS, wholeWords: true })
    if (found) return found
  }
  return null
}

/** The AI's profile matches that check out, one per requirement and item, with the item copied in. */
export function cleanProfileMatches(raw: readonly RawProfileMatch[], items: readonly ProfileItem[], requirementIds: ReadonlySet<string>): ProfileEvidence[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const seen = new Set<string>()
  return raw.flatMap((m) => {
    const requirementId = m.requirementId.trim()
    const item = byId.get(m.itemId.trim())
    const key = `${requirementId}|${item?.id}`
    if (!item || !requirementIds.has(requirementId) || seen.has(key)) return []
    const found = m.phrases.map((p) => inItem(item, p)).filter((p): p is string => p !== null)
    const phrases = found.filter((p, i) => found.indexOf(p) === i).slice(0, MAX_PHRASES)
    if (!phrases.length) return []
    seen.add(key)
    return [{ requirementId, kind: item.kind, title: item.title, dates: item.dates, detail: item.detail, phrases, partly: m.partly }]
  })
}

/** A requirement his profile shows in full is covered; shown partly, a missing one becomes partial. Never lowered. */
export function withProfileStatus(requirements: readonly JobRequirement[], evidence: readonly ProfileEvidence[]): JobRequirement[] {
  return requirements.map((r) => {
    const mine = evidence.filter((e) => e.requirementId === r.id)
    if (!mine.length || r.status === 'covered') return r
    if (mine.some((e) => !e.partly)) return { ...r, status: 'covered' }
    return r.status === 'missing' ? { ...r, status: 'partial' } : r
  })
}

import { describe, expect, test } from 'vitest'
import { analysisDraftForRequirement } from './requirement-draft'
import { keptDraftInput, mapCvItems } from './cv-save'

const item = (section: 'EXPERIENCE' | 'PROJECT', position: number, versionId: string) => ({ section, position, versionId })

describe('mapCvItems', () => {
  test('swaps draft ids for the saved version ids', () => {
    const out = mapCvItems([item('EXPERIENCE', 0, 'v1'), item('EXPERIENCE', 1, 'draft:d1')], { 'draft:d1': 'v-new' })
    expect(out).toEqual([item('EXPERIENCE', 0, 'v1'), item('EXPERIENCE', 1, 'v-new')])
  })

  test('drops a draft id that was not saved and renumbers', () => {
    const out = mapCvItems([item('EXPERIENCE', 0, 'draft:gone'), item('EXPERIENCE', 1, 'v1'), item('PROJECT', 2, 'v2')], {})
    expect(out).toEqual([item('EXPERIENCE', 0, 'v1'), item('PROJECT', 1, 'v2')])
  })

  test('orders by position and keeps the array order on ties', () => {
    const out = mapCvItems([item('PROJECT', 5, 'b'), item('EXPERIENCE', 1, 'a'), item('EXPERIENCE', 1, 'c')], {})
    expect(out.map((i) => i.versionId)).toEqual(['a', 'c', 'b'])
    expect(out.map((i) => i.position)).toEqual([0, 1, 2])
  })

  test('the same version is used once', () => {
    const out = mapCvItems([item('EXPERIENCE', 0, 'v1'), item('PROJECT', 1, 'v1')], {})
    expect(out).toEqual([item('EXPERIENCE', 0, 'v1')])
  })

  test('an update draft maps to the version it updated', () => {
    expect(mapCvItems([item('EXPERIENCE', 0, 'draft:u')], { 'draft:u': 'v-from' })).toEqual([item('EXPERIENCE', 0, 'v-from')])
  })

  test('ids like "constructor" and "__proto__" are not looked up on the object prototype', () => {
    const out = mapCvItems([item('EXPERIENCE', 0, 'constructor'), item('PROJECT', 1, '__proto__'), item('PROJECT', 2, 'toString')], {})
    expect(out.map((i) => i.versionId)).toEqual(['constructor', '__proto__', 'toString'])
  })

  test('does not change its input', () => {
    const items = [item('EXPERIENCE', 3, 'draft:d1')]
    mapCvItems(items, { 'draft:d1': 'x' })
    expect(items[0].versionId).toBe('draft:d1')
  })
})

const base = {
  key: 'd1',
  blockId: 'b1',
  newBlock: null,
  name: 'Acme · SRE',
  title: 'Engineer',
  bullets: [{ kind: 'PROJECT' as const, text: 'Built X.', want: null }],
  waitingOn: null,
  saveAs: 'new' as const,
  fromVersionId: 'v1',
  extra: 'ignored',
}

describe('keptDraftInput', () => {
  test('accepts a draft with the session fields and drops unknown keys', () => {
    const parsed = keptDraftInput.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'extra' in parsed.data).toBe(false)
  })

  test('allows up to 12 bullets of 1200 characters', () => {
    const bullets = Array.from({ length: 12 }, () => ({ kind: 'IMPACT' as const, text: 'x'.repeat(1200), want: null }))
    expect(keptDraftInput.safeParse({ ...base, bullets }).success).toBe(true)
    expect(keptDraftInput.safeParse({ ...base, bullets: [...bullets, bullets[0]] }).success).toBe(false)
    expect(keptDraftInput.safeParse({ ...base, bullets: [{ kind: 'IMPACT', text: 'x'.repeat(1201), want: null }] }).success).toBe(false)
  })

  test('a MISSING bullet may carry a hint of up to 400 characters', () => {
    const missing = (n: number) => [{ kind: 'MISSING' as const, text: 'h'.repeat(n), want: 'IMPACT' as const }]
    expect(keptDraftInput.safeParse({ ...base, bullets: missing(400) }).success).toBe(true)
    expect(keptDraftInput.safeParse({ ...base, bullets: missing(401) }).success).toBe(false)
  })

  test('needs a block or a new block, and nothing waiting', () => {
    expect(keptDraftInput.safeParse({ ...base, blockId: null }).success).toBe(false)
    expect(keptDraftInput.safeParse({ ...base, waitingOn: 'q1' }).success).toBe(false)
  })

  test('saveAs must be new or update', () => {
    expect(keptDraftInput.safeParse({ ...base, saveAs: 'replace' }).success).toBe(false)
  })
})

describe('analysisDraftForRequirement', () => {
  const draft = { blockId: 'b1', newBlock: null, name: 'Kafka focus', title: 'Engineer', bullets: [], waitingOn: null }

  test('a new version of an existing block starts from that block\'s first version', () => {
    const out = analysisDraftForRequirement(draft, { requirementId: 'r3', requirementName: 'Kafka', experienceTitle: 'Visio AI', blockName: 'Visio AI', from: { id: 'v1', name: 'Base' } })
    expect(out).toMatchObject({
      key: 'add-r3',
      improvedBy: null,
      fromVersionId: 'v1',
      fromVersionName: 'Base',
      blockName: 'Visio AI',
      matches: [{ requirementId: 'r3', phrases: [], partly: false }],
    })
    expect(out.note).toContain('Kafka')
  })

  test('a new block has no source version and takes its own name', () => {
    const nb = { name: 'Study Rats', section: 'PROJECT' as const, org: '', location: '', dates: '', stack: '' }
    const out = analysisDraftForRequirement({ ...draft, blockId: null, newBlock: nb }, { requirementId: 'r3', requirementName: 'Kafka', experienceTitle: 'Study Rats', blockName: null, from: null })
    expect(out).toMatchObject({ fromVersionId: null, fromVersionName: null, blockName: 'Study Rats' })
  })
})

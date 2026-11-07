import { describe, expect, it } from 'vitest'
import type { ReusedVersion } from '../ai/types'
import type { LibBlock, LibVersion } from '../blocks/types'
import { toSavedItems } from '../cv/composition'
import type { SessionDraft } from './types'
import { compositionForReview, draftVersionId, isDraftVersionId, libraryWithDrafts, savedItemsFor } from './cv-draft'

const version = (id: string, blockId: string, over: Partial<LibVersion> = {}): LibVersion => ({
  id,
  blockId,
  name: id,
  title: 'T',
  isBase: true,
  themes: [],
  position: 0,
  bullets: [{ kind: 'PROJECT', text: 'did', want: null }],
  jobIds: [],
  ...over,
})

const block = (id: string, section: 'EXPERIENCE' | 'PROJECT', position: number, versions: LibVersion[]): LibBlock => ({
  id,
  slug: id,
  name: id,
  section,
  org: 'Org',
  location: 'Loc',
  dates: '2024',
  stack: 'TS',
  position,
  versions,
})

const library: LibBlock[] = [
  block('visio', 'EXPERIENCE', 0, [version('visio-base', 'visio')]),
  block('bi', 'EXPERIENCE', 1, [version('bi-base', 'bi')]),
  block('rats', 'PROJECT', 2, [version('rats-base', 'rats')]),
  block('empty', 'PROJECT', 3, []),
]

const draft = (over: Partial<SessionDraft> = {}): SessionDraft => ({
  key: 'k1',
  blockName: 'Visio AI',
  note: 'n',
  fromVersionId: 'visio-base',
  fromVersionName: 'Base',
  improvedBy: null,
  matches: [],
  blockId: 'visio',
  newBlock: null,
  name: 'For Acme',
  title: 'AI Eng',
  bullets: [
    { kind: 'PROJECT', text: 'Built RAG' },
    { kind: 'IMPACT', text: '', want: 'IMPACT' },
  ],
  waitingOn: null,
  keep: true,
  editedByHand: false,
  saveAs: 'new',
  ...over,
})

const reused = (versionId: string, blockId: string): ReusedVersion => ({ versionId, blockId, matches: [], why: '' }) as unknown as ReusedVersion

describe('draft ids', () => {
  it('builds and recognises draft version ids', () => {
    expect(draftVersionId('k1')).toBe('draft:k1')
    expect(isDraftVersionId('draft:k1')).toBe(true)
    expect(isDraftVersionId('visio-base')).toBe(false)
  })
})

describe('libraryWithDrafts', () => {
  it('adds a kept draft as a new version inside its block', () => {
    const out = libraryWithDrafts(library, [draft()])
    const added = out[0].versions.find((v) => v.id === 'draft:k1')
    expect(added).toMatchObject({ blockId: 'visio', name: 'For Acme', title: 'AI Eng', isBase: false })
    expect(added?.bullets).toEqual([
      { kind: 'PROJECT', text: 'Built RAG', want: null },
      { kind: 'IMPACT', text: '', want: 'IMPACT' },
    ])
    expect(out[0].versions).toHaveLength(2)
  })

  it('does not mutate the library', () => {
    const before = JSON.stringify(library)
    libraryWithDrafts(library, [draft()])
    expect(JSON.stringify(library)).toBe(before)
  })

  it('skips drafts that are not kept', () => {
    expect(libraryWithDrafts(library, [draft({ keep: false })])).toEqual(library)
  })

  it('creates a temporary block for a new-block draft', () => {
    const d = draft({
      key: 'nb',
      blockId: null,
      newBlock: { name: 'Kafka pipeline', section: 'PROJECT', org: 'Acme', location: 'Remote', dates: '2025', stack: 'Kafka' },
    })
    const out = libraryWithDrafts(library, [d])
    const added = out.find((b) => b.id === 'draftblock:nb')
    expect(added).toMatchObject({ name: 'Kafka pipeline', section: 'PROJECT', org: 'Acme', location: 'Remote', dates: '2025', stack: 'Kafka' })
    expect(added?.versions[0]).toMatchObject({ id: 'draft:nb', blockId: 'draftblock:nb' })
    expect(added!.position).toBeGreaterThan(3)
  })

  it('skips drafts whose block does not exist and that have no new block', () => {
    expect(libraryWithDrafts(library, [draft({ blockId: 'ghost' })])).toEqual(library)
  })
})

describe('compositionForReview', () => {
  const base = { library, drafts: [] as SessionDraft[], reused: [] as ReusedVersion[], asIsOut: [] as string[], pages: 1 as const }

  it('uses the reused versions in library order, split by section', () => {
    const c = compositionForReview({ ...base, reused: [reused('rats-base', 'rats'), reused('bi-base', 'bi'), reused('visio-base', 'visio')] })
    expect(c.order).toEqual(['EXPERIENCE', 'PROJECT'])
    expect(c.items.EXPERIENCE).toEqual([
      { blockId: 'visio', versionId: 'visio-base' },
      { blockId: 'bi', versionId: 'bi-base' },
    ])
    expect(c.items.PROJECT).toEqual([{ blockId: 'rats', versionId: 'rats-base' }])
    expect(c.pages).toBe(1)
    expect(c.edu).toBe(true)
    expect(c.skills).toBe(true)
  })

  it('prefers the kept draft over the reused version of the same block', () => {
    const c = compositionForReview({ ...base, drafts: [draft()], reused: [reused('visio-base', 'visio')] })
    expect(c.items.EXPERIENCE).toEqual([{ blockId: 'visio', versionId: 'draft:k1' }])
  })

  it('excludes reused versions left out with asIsOut', () => {
    const c = compositionForReview({ ...base, reused: [reused('bi-base', 'bi'), reused('visio-base', 'visio')], asIsOut: ['bi-base'] })
    expect(c.items.EXPERIENCE).toEqual([{ blockId: 'visio', versionId: 'visio-base' }])
  })

  it('includes a draft for a new block in its section', () => {
    const d = draft({
      key: 'nb',
      blockId: null,
      newBlock: { name: 'Kafka', section: 'PROJECT', org: '', location: '', dates: '', stack: '' },
    })
    const c = compositionForReview({ ...base, drafts: [d] })
    expect(c.items.PROJECT).toEqual([{ blockId: 'draftblock:nb', versionId: 'draft:nb' }])
  })

  it('ignores drafts that are not kept and empty blocks', () => {
    const c = compositionForReview({ ...base, drafts: [draft({ keep: false })] })
    expect(c.items).toEqual({ EXPERIENCE: [], PROJECT: [] })
  })

  it('does not mutate its inputs', () => {
    const input = { ...base, drafts: [draft()], reused: [reused('visio-base', 'visio')] }
    const before = JSON.stringify(input)
    compositionForReview(input)
    expect(JSON.stringify(input)).toBe(before)
  })
})

describe('savedItemsFor', () => {
  it('maps temporary draft ids to the saved ids', () => {
    const c = compositionForReview({ library, drafts: [draft()], reused: [reused('bi-base', 'bi')], asIsOut: [], pages: 2 })
    expect(savedItemsFor(c, { 'draft:k1': 'real-1' })).toEqual([
      { section: 'EXPERIENCE', versionId: 'real-1', position: 0 },
      { section: 'EXPERIENCE', versionId: 'bi-base', position: 1 },
    ])
  })

  it('drops draft rows that were not saved and renumbers positions', () => {
    const c = compositionForReview({ library, drafts: [draft()], reused: [reused('bi-base', 'bi')], asIsOut: [], pages: 2 })
    expect(savedItemsFor(c, {})).toEqual([{ section: 'EXPERIENCE', versionId: 'bi-base', position: 0 }])
  })

  it('a version id like "constructor" is not looked up on the object prototype', () => {
    const lib = [block('odd', 'EXPERIENCE', 0, [version('constructor', 'odd'), version('__proto__', 'odd', { position: 1 })])]
    const c = compositionForReview({ library: lib, drafts: [], reused: [reused('constructor', 'odd')], asIsOut: [], pages: 2 })
    expect(savedItemsFor(c, {})).toEqual([{ section: 'EXPERIENCE', versionId: 'constructor', position: 0 }])
  })

  it('matches toSavedItems when there are no drafts', () => {
    const c = compositionForReview({ library, drafts: [], reused: [reused('bi-base', 'bi')], asIsOut: [], pages: 2 })
    expect(savedItemsFor(c, {})).toEqual(toSavedItems(c))
  })
})

import { describe, expect, test } from 'vitest'
import type { ReusedVersion } from '../ai/types'
import type { LibBlock, LibVersion } from '../blocks/types'
import { compositionForReview, libraryWithDrafts } from './cv-draft'
import { libraryWithTitles, roleOnly, roleTitleRows, setTitleChoice, titlesForSave, titleWithPlace, type RoleTitleRow } from './role-titles'
import { SESSION_VERSION, type AnalysisSession, type SessionDraft, type TitleChoice } from './types'

const version = (id: string, blockId: string, title: string): LibVersion => ({
  id,
  blockId,
  name: 'Base',
  title,
  isBase: true,
  themes: [],
  position: 0,
  bullets: [{ kind: 'PROJECT', text: 'did', want: null }],
  jobIds: [],
})

const block = (id: string, name: string, section: 'EXPERIENCE' | 'PROJECT', position: number, title: string): LibBlock => ({
  id,
  slug: id,
  name,
  section,
  org: 'Org',
  location: '',
  dates: '2026',
  stack: '',
  position,
  versions: [version(`${id}-base`, id, title)],
})

const LIBRARY: LibBlock[] = [
  block('visio', 'Visio AI', 'EXPERIENCE', 0, 'Software Engineer Intern'),
  block('rats', 'Study Rats', 'EXPERIENCE', 1, 'Tech Lead, Full-Stack'),
  block('termo', 'Termo', 'PROJECT', 2, 'Termo — Wordle'),
]

const draft = (over: Partial<SessionDraft> = {}): SessionDraft => ({
  key: 'd1',
  blockId: 'rats',
  newBlock: null,
  blockName: 'Study Rats',
  name: 'iFood · AI Builder',
  title: 'Tech Lead, Full-Stack',
  bullets: [{ kind: 'PROJECT', text: 'Built RAG' }],
  waitingOn: null,
  note: '',
  fromVersionId: 'rats-base',
  fromVersionName: 'Base',
  improvedBy: null,
  matches: [],
  keep: true,
  editedByHand: false,
  saveAs: 'new',
  ...over,
})

const reused = (versionId: string, blockId: string): ReusedVersion => ({ versionId, blockId, matches: [], why: '' }) as unknown as ReusedVersion

function rowsFor(titles: Record<string, TitleChoice> | undefined, drafts: SessionDraft[] = [draft()]) {
  const library = libraryWithDrafts(LIBRARY, drafts)
  const comp = compositionForReview({ library: LIBRARY, drafts, reused: [reused('visio-base', 'visio'), reused('termo-base', 'termo')], asIsOut: [], pages: 1 })
  return roleTitleRows({ comp, library, drafts, roleTitles: [{ block: 'visio', title: 'AI Builder' }], titles, jobRole: 'AI Builder (Estágio)' })
}

describe('roleTitleRows with the CV arranged', () => {
  const base = { library: LIBRARY, drafts: [] as SessionDraft[], reused: [reused('visio-base', 'visio'), reused('rats-base', 'rats'), reused('termo-base', 'termo')], asIsOut: [], pages: 1 as const }
  const names = (arrangement: AnalysisSession['arrangement']) =>
    roleTitleRows({ comp: compositionForReview({ ...base, arrangement }), library: LIBRARY, drafts: [], jobRole: 'AI Builder' }).map((r) => r.blockName)

  test('one section: only experiences get a row, in the CV’s order', () => {
    expect(names({ oneSection: true, order: ['termo', 'rats', 'visio'] })).toEqual(['Study Rats', 'Visio AI'])
  })

  test('an experience moved to Projects keeps its row; a project moved to Experience gets none', () => {
    expect(names({ sections: { rats: 'PROJECT', termo: 'EXPERIENCE' } })).toEqual(['Visio AI', 'Study Rats'])
  })
})

describe('roleTitleRows', () => {
  test('one row per experience in the CV, none for projects; "You have" is the title on the CV now', () => {
    const rows = rowsFor(undefined)
    expect(rows.map((r) => [r.blockName, r.have])).toEqual([
      ['Visio AI', 'Software Engineer Intern'],
      ['Study Rats', 'Tech Lead, Full-Stack'],
    ])
    expect(rows[1].versionId).toBe('draft:d1')
  })

  test('nothing changes unless you pick it: the default is the title you have', () => {
    const rows = rowsFor(undefined)
    expect(rows.every((r) => r.choice.pick === 'mine' && r.chosen === r.have && !r.changed)).toBe(true)
  })

  test('"AI recommends" is the AI title for the block, else the job role', () => {
    const rows = rowsFor(undefined)
    expect(rows.map((r) => r.ai)).toEqual(['AI Builder', 'AI Builder (Estágio)'])
  })

  test('the pick decides the title; "Write my own" with nothing written shows the one you have', () => {
    const rows = rowsFor({ visio: { pick: 'ai', own: '' }, rats: { pick: 'own', own: '  ' } })
    expect(rows[0]).toMatchObject({ chosen: 'AI Builder', changed: true })
    expect(rows[1]).toMatchObject({ chosen: 'Tech Lead, Full-Stack', changed: false })
    expect(rowsFor({ rats: { pick: 'own', own: ' Full-Stack Engineer ' } })[1]).toMatchObject({ chosen: 'Full-Stack Engineer', changed: true })
  })

  test('a draft saved as Update names the version a new title reaches', () => {
    expect(rowsFor(undefined, [draft({ saveAs: 'update' })])[1].updatesVersion).toBe('Base')
    expect(rowsFor(undefined)[1].updatesVersion).toBeNull()
  })

  test('a new block is keyed by its name', () => {
    const nb = draft({ key: 'nb', blockId: null, blockName: 'Kafka', newBlock: { name: 'Kafka', section: 'EXPERIENCE', org: '', location: '', dates: '', stack: '' }, title: 'Data Intern' })
    const rows = rowsFor({ 'new:kafka': { pick: 'ai', own: '' } }, [nb])
    expect(rows.find((r) => r.blockName === 'Kafka')).toMatchObject({ key: 'new:kafka', chosen: 'AI Builder (Estágio)', changed: true })
  })
})

describe('titleWithPlace (an experience title is "Role — Place")', () => {
  test('the place of the title you have stays', () => {
    expect(titleWithPlace('AI Builder', 'Software Engineer Intern — Visio AI', true)).toBe('AI Builder — Visio AI')
    expect(titleWithPlace(' Data Engineer ', 'Tech Lead, Full-Stack — Study Rats')).toBe('Data Engineer — Study Rats')
  })

  test('the AI never rewrites the place; a title you write with its own place is yours', () => {
    expect(titleWithPlace('AI Builder — iFood', 'Software Engineer Intern — Visio AI', true)).toBe('AI Builder — Visio AI')
    expect(titleWithPlace('AI Builder — Visio AI (part-time)', 'Software Engineer Intern — Visio AI')).toBe('AI Builder — Visio AI (part-time)')
  })

  test('from the AI only the role counts, whatever separator it put before a place', () => {
    expect(roleOnly('AI Builder — IAAS! Fintech')).toBe('AI Builder')
    expect(roleOnly('AI Builder – IAAS!')).toBe('AI Builder')
    expect(roleOnly('AI Builder - IAAS!')).toBe('AI Builder')
    expect(roleOnly('AI Builder | IAAS!')).toBe('AI Builder')
    expect(roleOnly('AI Builder at IAAS!')).toBe('AI Builder')
    expect(roleOnly('AI Builder @ IAAS!')).toBe('AI Builder')
    expect(roleOnly('Back-End Developer')).toBe('Back-End Developer')
    expect(titleWithPlace('AI Builder – iFood', 'Full-Stack Engineer Intern — IAAS! Fintech', true)).toBe('AI Builder — IAAS! Fintech')
  })

  test('the AI option shows the role alone; picking it keeps the place of the title you have', () => {
    const lib = [block('iaas', 'IAAS!', 'EXPERIENCE', 0, 'Full-Stack Engineer Intern — IAAS! Fintech')]
    const comp = compositionForReview({ library: lib, drafts: [], reused: [reused('iaas-base', 'iaas')], asIsOut: [], pages: 1 })
    const [row] = roleTitleRows({ comp, library: lib, drafts: [], roleTitles: [{ block: 'iaas', title: 'AI Builder — IAAS! Fintech' }], titles: { iaas: { pick: 'ai', own: '' } }, jobRole: 'AI Builder' })
    expect(row).toMatchObject({ aiRole: 'AI Builder', ai: 'AI Builder — IAAS! Fintech', chosen: 'AI Builder — IAAS! Fintech' })
  })

  test('a title with no place, or an empty role, stays as given', () => {
    expect(titleWithPlace('AI Builder', 'Software Engineer Intern', true)).toBe('AI Builder')
    expect(titleWithPlace('  ', 'Software Engineer Intern — Visio AI')).toBe('')
  })

  test('the rows offer and show the title with its place', () => {
    const lib = [block('visio', 'Visio AI', 'EXPERIENCE', 0, 'Software Engineer Intern — Visio AI')]
    const comp = compositionForReview({ library: lib, drafts: [], reused: [reused('visio-base', 'visio')], asIsOut: [], pages: 1 })
    const [row] = roleTitleRows({ comp, library: lib, drafts: [], roleTitles: [{ block: 'visio', title: 'AI Builder' }], titles: { visio: { pick: 'ai', own: '' } }, jobRole: 'Trilha AI Builder' })
    expect(row).toMatchObject({ ai: 'AI Builder — Visio AI', chosen: 'AI Builder — Visio AI', changed: true })
  })
})

describe('setTitleChoice', () => {
  test('saves the pick by block key without changing the session it got', () => {
    const s = { v: SESSION_VERSION, titles: undefined } as unknown as AnalysisSession
    const next = setTitleChoice(s, 'visio', { pick: 'ai', own: '' })
    expect(next.titles).toEqual({ visio: { pick: 'ai', own: '' } })
    expect(s.titles).toBeUndefined()
    expect(setTitleChoice(next, 'rats', { pick: 'own', own: 'X' }).titles).toEqual({ visio: { pick: 'ai', own: '' }, rats: { pick: 'own', own: 'X' } })
  })
})

describe('libraryWithTitles', () => {
  test('shows the chosen titles and leaves the library it got untouched', () => {
    const rows = rowsFor({ visio: { pick: 'ai', own: '' } })
    const before = JSON.stringify(LIBRARY)
    const out = libraryWithTitles(LIBRARY, rows)
    expect(out[0].versions[0].title).toBe('AI Builder')
    expect(out[1]).toBe(LIBRARY[1])
    expect(JSON.stringify(LIBRARY)).toBe(before)
  })
})

describe('titlesForSave', () => {
  const rowsOf = (over: Partial<RoleTitleRow>[]): RoleTitleRow[] => rowsFor(undefined).map((r, i) => ({ ...r, ...over[i] }))

  test('a draft takes its chosen title; a version used as it is gets a new version for the job, never its own title changed', () => {
    const rows = rowsOf([{ chosen: 'AI Builder', changed: true }, { chosen: 'AI Builder', changed: true }])
    const out = titlesForSave([draft()], rows)
    expect(out.drafts[0].title).toBe('AI Builder')
    expect(out.retitled).toEqual([{ versionId: 'visio-base', title: 'AI Builder' }])
  })

  test('titles you kept send nothing extra', () => {
    const drafts = [draft()]
    expect(titlesForSave(drafts, rowsFor(undefined))).toEqual({ drafts, retitled: [] })
  })
})

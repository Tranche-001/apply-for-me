// pairLibrary with the database, the context loaders and the AI draft mocked. Never touches a real database.
import { beforeEach, describe, expect, test, vi } from 'vitest'

const m = vi.hoisted(() => ({
  experience: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  block: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
  loadExperiences: vi.fn(),
  loadLibrary: vi.fn(),
  loadRules: vi.fn(),
  draftBlockWith: vi.fn(),
  saveDraftToLibrary: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => {
  const tx = { experience: m.experience, block: m.block }
  return { db: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }
})
vi.mock('../ai/context', () => ({ loadExperiences: m.loadExperiences, loadLibrary: m.loadLibrary, loadRules: m.loadRules }))
vi.mock('../ai/block-draft', () => ({ draftBlockWith: m.draftBlockWith }))
vi.mock('../ai/library-writes', () => ({ saveDraftToLibrary: m.saveDraftToLibrary }))

const { pairLibrary, readPairingNeeds } = await import('./pairing')

const AI = { provider: 'gemini', run: vi.fn() } as never
const APPLY = { id: 'e-apply', title: 'Apply For Me', notes: 'Built an AI CV app with Next.js.', blocks: [] }
const EMPTY = { id: 'e-empty', title: '', notes: ' ', blocks: [] }
const PAIRED = { id: 'e-visio', title: 'Visio AI', notes: 'Intern', blocks: [{ id: 'b-visio' }] }
const NEW_BLOCK_DRAFT = {
  blockId: null,
  newBlock: { name: 'Apply For Me', section: 'PROJECT', org: '', location: '', dates: '2026', stack: 'Next.js' },
  name: 'Base',
  title: 'Apply For Me — AI CV builder',
  bullets: [{ kind: 'PROJECT', text: 'Built an AI CV app with Next.js.', want: null }],
  waitingOn: null,
}

function library(experiences: unknown[], blocks: unknown[]) {
  m.experience.findMany.mockResolvedValue(experiences)
  m.block.findMany.mockResolvedValue(blocks)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.loadRules.mockResolvedValue([])
  m.loadLibrary.mockResolvedValue([])
  m.loadExperiences.mockResolvedValue([{ id: 'e-apply', title: 'Apply For Me', where: '', when: '', notes: APPLY.notes, blockIds: [] }])
  m.block.count.mockResolvedValue(0)
  m.draftBlockWith.mockResolvedValue(NEW_BLOCK_DRAFT)
  m.saveDraftToLibrary.mockResolvedValue({ blockId: 'b-new', blockName: 'Apply For Me', versionId: 'v1', versionName: 'Base', isNewBlock: true })
})

describe('pairLibrary', () => {
  test('an experience with notes and no block gets an AI-drafted block, linked to it', async () => {
    library([APPLY, PAIRED], [{ id: 'b-visio', name: 'Visio AI', experienceId: 'e-visio' }])
    const result = await pairLibrary(AI)
    expect(result.blocksMade).toEqual(['Apply For Me'])
    expect(m.saveDraftToLibrary).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ newBlock: expect.objectContaining({ name: 'Apply For Me' }) }), { experienceId: 'e-apply' })
  })

  test('a block with no experience gets one made from its own text and linked', async () => {
    library([], [{ id: 'b-termo', name: 'Termo', experienceId: null }])
    m.block.findUnique.mockResolvedValue({
      name: 'Termo',
      org: 'AI & Automation project',
      location: '',
      dates: '2024',
      stack: '',
      experienceId: null,
      versions: [{ title: 'Termo solver', bullets: [{ kind: 'PROJECT', text: 'Built a solver.' }] }],
    })
    m.experience.findFirst.mockResolvedValue({ position: 4 })
    m.experience.create.mockResolvedValue({ id: 'e-new' })
    m.block.updateMany.mockResolvedValue({ count: 1 })
    const result = await pairLibrary(AI)
    expect(result.experiencesMade).toEqual(['Termo'])
    expect(m.experience.create).toHaveBeenCalledWith({
      data: { title: 'Termo', where: 'AI & Automation project', when: '2024', notes: 'From the block “Termo”:\nTitle on my CV: Termo solver\n- Built a solver.', position: 5 },
    })
    expect(m.block.updateMany).toHaveBeenCalledWith({ where: { id: 'b-termo', experienceId: null }, data: { experienceId: 'e-new' } })
    expect(m.draftBlockWith).not.toHaveBeenCalled()
  })

  test('a block with no experience is linked to the blockless experience of the same name; nothing is made', async () => {
    library([{ id: 'e-termo', title: 'Termo', notes: '', blocks: [] }], [{ id: 'b-termo', name: 'Termo', experienceId: null }])
    m.block.updateMany.mockResolvedValue({ count: 1 })
    const result = await pairLibrary(AI)
    expect(result).toMatchObject({ linked: ['Termo'], experiencesMade: [], blocksMade: [] })
    expect(m.block.updateMany).toHaveBeenCalledWith({ where: { id: 'b-termo', experienceId: null }, data: { experienceId: 'e-termo' } })
    expect(m.experience.create).not.toHaveBeenCalled()
    expect(m.draftBlockWith).not.toHaveBeenCalled()
  })

  test('an experience with nothing written is left alone and named', async () => {
    library([EMPTY], [])
    const result = await pairLibrary(AI)
    expect(result).toMatchObject({ blocksMade: [], needNotes: ['Untitled experience'] })
    expect(m.draftBlockWith).not.toHaveBeenCalled()
  })

  test('without an AI key, blocks still get experiences and the experiences wait for the AI', async () => {
    library([APPLY], [])
    const result = await pairLibrary(null)
    expect(result.waitingForAi).toEqual(['Apply For Me'])
    expect(m.draftBlockWith).not.toHaveBeenCalled()
  })

  test('a block linked by another run during the AI call is not saved twice', async () => {
    library([APPLY], [])
    m.block.count.mockResolvedValue(1)
    const result = await pairLibrary(AI)
    expect(m.saveDraftToLibrary).not.toHaveBeenCalled()
    expect(result).toMatchObject({ blocksMade: [], failed: [] })
  })

  test('an AI failure is reported by name and never thrown', async () => {
    library([APPLY], [])
    m.draftBlockWith.mockRejectedValue(new Error('overloaded'))
    const result = await pairLibrary(AI)
    expect(result.failed).toEqual(['Apply For Me'])
    expect(console.error).toHaveBeenCalled()
  })
})

describe('readPairingNeeds', () => {
  test('names what is missing', async () => {
    library([APPLY, EMPTY, PAIRED], [{ id: 'b-x', name: 'Termo', experienceId: null }])
    expect(await readPairingNeeds()).toEqual({ needBlock: ['Apply For Me'], needNotes: ['Untitled experience'], needExperience: ['Termo'] })
  })
})

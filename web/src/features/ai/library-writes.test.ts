// saveTitleForJob with a fake transaction. Never touches a real database.
import { describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { saveTitleForJob } = await import('./library-writes')

const BULLETS = [
  { kind: 'PROJECT', text: 'Built X.', want: null },
  { kind: 'MISSING', text: '', want: 'IMPACT' },
]

function fakeTx(versions: { id: string; name: string; title: string; position: number; bullets?: typeof BULLETS; jobs?: { jobId: string }[] }[], source: string | null = 'v-base') {
  const create = vi.fn(async () => ({ id: 'v-new' }))
  const all = versions.map((v) => ({ bullets: BULLETS, jobs: [], ...v }))
  const findUnique = vi.fn(async () => {
    const v = all.find((x) => x.id === source)
    return v ? { title: v.title, bullets: v.bullets, block: { id: 'b-visio', name: 'Visio AI', versions: all } } : null
  })
  return { tx: { version: { findUnique, create } } as never, create }
}

const LINK = { jobId: 'j1', name: 'iFood · AI Builder' }

describe('saveTitleForJob', () => {
  test('copies the version with the new title as a version for this job; the version itself is not changed', async () => {
    const { tx, create } = fakeTx([{ id: 'v-base', name: 'Base', title: 'Software Engineer Intern', position: 0 }])
    const saved = await saveTitleForJob(tx, 'v-base', 'AI Builder', LINK)
    expect(create).toHaveBeenCalledWith({
      data: {
        blockId: 'b-visio',
        name: 'iFood · AI Builder',
        title: 'AI Builder',
        isBase: false,
        themes: [],
        position: 1,
        bullets: { create: [{ kind: 'PROJECT', text: 'Built X.', want: null, position: 0 }, { kind: 'MISSING', text: '', want: 'IMPACT', position: 1 }] },
        jobs: { create: [{ jobId: 'j1' }] },
      },
    })
    expect(saved).toEqual({ blockId: 'b-visio', blockName: 'Visio AI', versionId: 'v-new', versionName: 'iFood · AI Builder', isNewBlock: false })
  })

  test('a name already taken in the block gets a free one', async () => {
    const { tx, create } = fakeTx([
      { id: 'v-base', name: 'Base', title: 'Software Engineer Intern', position: 0 },
      { id: 'v-old', name: 'iFood · AI Builder', title: 'Other', position: 3, jobs: [{ jobId: 'j1' }] },
    ])
    await saveTitleForJob(tx, 'v-base', 'AI Builder', LINK)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ position: 4 }) }))
    const name = (create.mock.calls[0] as unknown as [{ data: { name: string } }])[0].data.name
    expect(name).not.toBe('iFood · AI Builder')
    expect(name).toContain('iFood · AI Builder')
  })

  test('a version made for this job with that title and the same bullets is used again (saving twice makes one version)', async () => {
    const { tx, create } = fakeTx([
      { id: 'v-base', name: 'Base', title: 'Software Engineer Intern', position: 0 },
      { id: 'v-made', name: 'iFood · AI Builder', title: 'AI Builder', position: 1, jobs: [{ jobId: 'j1' }] },
    ])
    expect((await saveTitleForJob(tx, 'v-base', 'AI Builder', LINK)).versionId).toBe('v-made')
    expect(create).not.toHaveBeenCalled()
  })

  test('a version that is gone rolls the save back', async () => {
    const { tx } = fakeTx([], null)
    await expect(saveTitleForJob(tx, 'v-gone', 'AI Builder', LINK)).rejects.toThrow('block-missing')
  })
})

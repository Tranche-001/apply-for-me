// appendAnswerToExperience with a fake Prisma transaction: where an answer goes, and that what you
// wrote before is never rewritten.
import type { Prisma } from '@prisma/client'
import { describe, expect, test, vi } from 'vitest'
import { appendAnswerToExperience, resendAnswerInExperience } from './answers'
import { ANSWERS_TITLE } from './types'

vi.mock('server-only', () => ({}))

type Row = { id: string; title: string; notes: string; position: number }

function fakeTx(rows: Row[]) {
  const data = rows.map((r) => ({ ...r }))
  const tx = {
    experience: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => data.find((r) => r.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { title: string } }) => data.find((r) => r.title === where.title) ?? null),
      aggregate: vi.fn(async () => ({ _max: { position: data.length ? Math.max(...data.map((r) => r.position)) : null } })),
      create: vi.fn(async ({ data: d }: { data: Omit<Row, 'id'> }) => {
        const row = { id: `e${data.length + 1}`, ...d }
        data.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data: d }: { where: { id: string }; data: { notes: string } }) => {
        const row = data.find((r) => r.id === where.id)!
        row.notes = d.notes
        return row
      }),
    },
  }
  return { tx: tx as unknown as Prisma.TransactionClient, data, fns: tx.experience }
}

const ENTRY = 'For iFood · GenAI\nThe AI asked: Did you use RAG?\nMy answer: Yes, at Visio AI.'
const OLD = 'Built a reconciliation platform.\nFeedback I got: fast learner.  '

describe('appendAnswerToExperience', () => {
  test('adds the answer at the end of the chosen experience; the old notes stay byte for byte', async () => {
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 0 }])
    await expect(appendAnswerToExperience(tx, 'visio', ENTRY)).resolves.toEqual({ experienceId: 'visio', title: 'Visio AI', added: true, entry: ENTRY, isNew: false })
    expect(data[0].notes.startsWith(OLD)).toBe(true)
    expect(data[0].notes).toBe(`${OLD}\n\n${ENTRY}`)
  })

  test('the same answer twice is added once', async () => {
    const { tx, data, fns } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 0 }])
    await appendAnswerToExperience(tx, 'visio', ENTRY)
    await expect(appendAnswerToExperience(tx, 'visio', ENTRY)).resolves.toMatchObject({ added: false })
    expect(fns.update).toHaveBeenCalledOnce()
    expect(data[0].notes).toBe(`${OLD}\n\n${ENTRY}`)
  })

  test('no experience chosen: goes to "Answers to the AI’s questions", created at the end the first time', async () => {
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 3 }])
    await expect(appendAnswerToExperience(tx, null, ENTRY)).resolves.toEqual({ experienceId: 'e2', title: ANSWERS_TITLE, added: true, entry: ENTRY, isNew: true })
    expect(data[1]).toMatchObject({ title: ANSWERS_TITLE, notes: ENTRY, position: 4 })
    expect(data[0].notes).toBe(OLD)

    await appendAnswerToExperience(tx, null, 'For X\nThe AI asked: Q2\nMy answer: A2')
    expect(data).toHaveLength(2)
    expect(data[1].notes).toBe(`${ENTRY}\n\nFor X\nThe AI asked: Q2\nMy answer: A2`)
  })

  test('the chosen experience was deleted meanwhile: the answer is not lost', async () => {
    const { tx, data } = fakeTx([{ id: 'answers', title: ANSWERS_TITLE, notes: '', position: 0 }])
    await expect(appendAnswerToExperience(tx, 'gone', ENTRY)).resolves.toEqual({ experienceId: 'answers', title: ANSWERS_TITLE, added: true, entry: ENTRY, isNew: false })
    expect(data[0].notes).toBe(ENTRY)
  })

  test('returns the exact entry written and isNew=false for existing places', async () => {
    const { tx } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 0 }])
    await expect(appendAnswerToExperience(tx, 'visio', ENTRY)).resolves.toEqual({ experienceId: 'visio', title: 'Visio AI', added: true, entry: ENTRY, isNew: false })
  })

  test('newExperienceTitle with no experience: creates it at the end with the entry as notes', async () => {
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 3 }])
    const placed = await appendAnswerToExperience(tx, null, ENTRY, { newExperienceTitle: 'Side project' })
    expect(placed).toEqual({ experienceId: 'e2', title: 'Side project', added: true, entry: ENTRY, isNew: true })
    expect(data[1]).toMatchObject({ title: 'Side project', notes: ENTRY, position: 4 })
    expect(data[0].notes).toBe(OLD)
  })

  test('newExperienceTitle is ignored when an existing experience is chosen', async () => {
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: '', position: 0 }])
    const placed = await appendAnswerToExperience(tx, 'visio', ENTRY, { newExperienceTitle: 'Ignored' })
    expect(placed).toMatchObject({ experienceId: 'visio', isNew: false })
    expect(data).toHaveLength(1)
  })
})

describe('resendAnswerInExperience', () => {
  const NEWER = 'For iFood · GenAI\nThe AI asked: Did you use RAG?\nMy answer: Yes, twice.'

  test('replaces only the old entry; the rest of the notes stays byte for byte', async () => {
    const notes = `Top.  \r\n\r\n${ENTRY}\n\nBottom.\n\n\n`
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes, position: 0 }])
    await expect(resendAnswerInExperience(tx, { experienceId: 'visio', oldEntry: ENTRY, newEntry: NEWER })).resolves.toEqual({
      experienceId: 'visio',
      title: 'Visio AI',
      entry: NEWER,
      replaced: true,
    })
    expect(data[0].notes).toBe(`Top.  \r\n\r\n${NEWER}\n\nBottom.\n\n\n`)
  })

  test('old text edited by hand: the new entry is appended at the end', async () => {
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 0 }])
    const res = await resendAnswerInExperience(tx, { experienceId: 'visio', oldEntry: ENTRY, newEntry: NEWER })
    expect(res).toMatchObject({ replaced: false, entry: NEWER })
    expect(data[0].notes).toBe(`${OLD}\n\n${NEWER}`)
  })

  test('newEntry null removes the old entry and one blank line', async () => {
    const { tx, data } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: `Top.\n\n${ENTRY}\n\nBottom.`, position: 0 }])
    const res = await resendAnswerInExperience(tx, { experienceId: 'visio', oldEntry: ENTRY, newEntry: null })
    expect(res).toEqual({ experienceId: 'visio', title: 'Visio AI', entry: null, replaced: true })
    expect(data[0].notes).toBe('Top.\n\nBottom.')
  })

  test('removal when the old text is gone changes nothing and does not write', async () => {
    const { tx, data, fns } = fakeTx([{ id: 'visio', title: 'Visio AI', notes: OLD, position: 0 }])
    const res = await resendAnswerInExperience(tx, { experienceId: 'visio', oldEntry: ENTRY, newEntry: null })
    expect(res).toMatchObject({ entry: null, replaced: false })
    expect(fns.update).not.toHaveBeenCalled()
    expect(data[0].notes).toBe(OLD)
  })

  test('experience deleted: the new entry goes to "Answers to the AI’s questions"', async () => {
    const { tx, data } = fakeTx([{ id: 'answers', title: ANSWERS_TITLE, notes: 'Before.', position: 0 }])
    const res = await resendAnswerInExperience(tx, { experienceId: 'gone', oldEntry: ENTRY, newEntry: NEWER })
    expect(res).toEqual({ experienceId: 'answers', title: ANSWERS_TITLE, entry: NEWER, replaced: false })
    expect(data[0].notes).toBe(`Before.\n\n${NEWER}`)
  })

  test('experience deleted and no answers experience: it is created; removal is a no-op', async () => {
    const created = fakeTx([])
    const res = await resendAnswerInExperience(created.tx, { experienceId: 'gone', oldEntry: ENTRY, newEntry: NEWER })
    expect(res).toMatchObject({ title: ANSWERS_TITLE, entry: NEWER, replaced: false })
    expect(created.data[0].notes).toBe(NEWER)

    const none = fakeTx([])
    const noop = await resendAnswerInExperience(none.tx, { experienceId: 'gone', oldEntry: ENTRY, newEntry: null })
    expect(noop).toEqual({ experienceId: 'gone', title: '', entry: null, replaced: false })
    expect(none.fns.create).not.toHaveBeenCalled()
  })
})

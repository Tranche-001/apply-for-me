// appendAnswerToExperience with a fake Prisma transaction: where an answer goes, and that what you
// wrote before is never rewritten.
import type { Prisma } from '@prisma/client'
import { describe, expect, test, vi } from 'vitest'
import { appendAnswerToExperience } from './answers'
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
    await expect(appendAnswerToExperience(tx, 'visio', ENTRY)).resolves.toEqual({ experienceId: 'visio', title: 'Visio AI', added: true })
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
    await expect(appendAnswerToExperience(tx, null, ENTRY)).resolves.toEqual({ experienceId: 'e2', title: ANSWERS_TITLE, added: true })
    expect(data[1]).toMatchObject({ title: ANSWERS_TITLE, notes: ENTRY, position: 4 })
    expect(data[0].notes).toBe(OLD)

    await appendAnswerToExperience(tx, null, 'For X\nThe AI asked: Q2\nMy answer: A2')
    expect(data).toHaveLength(2)
    expect(data[1].notes).toBe(`${ENTRY}\n\nFor X\nThe AI asked: Q2\nMy answer: A2`)
  })

  test('the chosen experience was deleted meanwhile: the answer is not lost', async () => {
    const { tx, data } = fakeTx([{ id: 'answers', title: ANSWERS_TITLE, notes: '', position: 0 }])
    await expect(appendAnswerToExperience(tx, 'gone', ENTRY)).resolves.toEqual({ experienceId: 'answers', title: ANSWERS_TITLE, added: true })
    expect(data[0].notes).toBe(ENTRY)
  })
})

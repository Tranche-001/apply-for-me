// writeCv with a fake Prisma transaction: the CV of a job is replaced by exactly what is given.
import type { Prisma } from '@prisma/client'
import { describe, expect, test, vi } from 'vitest'
import { UserError } from './action-result'
import { writeCv, type SaveCvInput } from './write-cv'

const SAVED_AT = new Date('2026-03-09T12:00:00Z')

function fakeTx(opts: { job?: boolean; versionsFound?: number } = {}) {
  const calls: string[] = []
  const tx = {
    job: { findUnique: vi.fn(async () => (opts.job === false ? null : { id: 'job1' })) },
    version: { count: vi.fn(async () => opts.versionsFound ?? 2) },
    cv: {
      upsert: vi.fn(async () => {
        calls.push('upsert')
        return { id: 'cv1', savedAt: SAVED_AT }
      }),
    },
    cvItem: {
      deleteMany: vi.fn(async () => {
        calls.push('deleteMany')
        return { count: 0 }
      }),
      createMany: vi.fn(async () => {
        calls.push('createMany')
        return { count: 0 }
      }),
    },
  }
  return { tx: tx as unknown as Prisma.TransactionClient, fns: tx, calls }
}

const INPUT: SaveCvInput = {
  jobId: 'job1',
  pages: 2,
  sectionOrder: ['EXPERIENCE', 'PROJECT', 'EXPERIENCE'],
  showEducation: true,
  showSkills: false,
  showAchievements: true,
  items: [
    { section: 'EXPERIENCE', position: 0, versionId: 'v1' },
    { section: 'EXPERIENCE', position: 1, versionId: 'v2' },
    { section: 'EXPERIENCE', position: 2, versionId: 'v1' },
  ],
}

describe('writeCv', () => {
  test('upserts the Cv, then replaces its items with positions as given', async () => {
    const { tx, fns, calls } = fakeTx()
    const result = await writeCv(tx, INPUT)

    expect(result.savedLabel).toMatch(/^Saved /)
    const call = fns.cv.upsert.mock.calls[0] as unknown as [{ where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }]
    const arg = call[0]
    expect(arg.where).toEqual({ jobId: 'job1' })
    expect(arg.update).toMatchObject({ pages: 2, showEducation: true, showSkills: false, showAchievements: true, source: '' })
    expect(arg.create).toMatchObject({ jobId: 'job1', pages: 2 })
    expect(arg.update.sectionOrder).toEqual(['EXPERIENCE', 'PROJECT'])
    expect(arg.update.savedAt).toBeInstanceOf(Date)

    expect(fns.cvItem.deleteMany).toHaveBeenCalledWith({ where: { cvId: 'cv1' } })
    expect(fns.cvItem.createMany).toHaveBeenCalledWith({
      data: [
        { cvId: 'cv1', versionId: 'v1', section: 'EXPERIENCE', position: 0 },
        { cvId: 'cv1', versionId: 'v2', section: 'EXPERIENCE', position: 1 },
        { cvId: 'cv1', versionId: 'v1', section: 'EXPERIENCE', position: 2 },
      ],
    })
    expect(calls).toEqual(['upsert', 'deleteMany', 'createMany'])
  })

  test('an empty CV clears the items and creates none', async () => {
    const { tx, fns } = fakeTx({ versionsFound: 0 })
    await writeCv(tx, { ...INPUT, items: [] })
    expect(fns.cvItem.deleteMany).toHaveBeenCalledOnce()
    expect(fns.cvItem.createMany).not.toHaveBeenCalled()
    expect(fns.version.count).toHaveBeenCalledWith({ where: { id: { in: [] } } })
  })

  test('counts each version once even when it is used several times', async () => {
    const { tx, fns } = fakeTx()
    await writeCv(tx, INPUT)
    expect(fns.version.count).toHaveBeenCalledWith({ where: { id: { in: ['v1', 'v2'] } } })
  })

  test('the job is gone: a plain-language error and nothing written', async () => {
    const { tx, fns } = fakeTx({ job: false })
    await expect(writeCv(tx, INPUT)).rejects.toThrow(new UserError('That job no longer exists. Pick another one.'))
    expect(fns.cv.upsert).not.toHaveBeenCalled()
  })

  test('a version was removed from the library: a plain-language error and nothing written', async () => {
    const { tx, fns } = fakeTx({ versionsFound: 1 })
    await expect(writeCv(tx, INPUT)).rejects.toBeInstanceOf(UserError)
    expect(fns.cv.upsert).not.toHaveBeenCalled()
    expect(fns.cvItem.deleteMany).not.toHaveBeenCalled()
  })
})

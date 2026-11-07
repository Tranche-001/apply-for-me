import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { DB_MESSAGES, plainDbError } from './db-errors'
import { draftVersionInput } from './draft-schema'
import { jobLabel } from './labels'
import { nextFreeName, slugify } from './naming'
import { invalidInput } from './result'

describe('naming', () => {
  test('slugify folds accents and punctuation', () => {
    expect(slugify('IAAS!')).toBe('iaas')
    expect(slugify('  Conciliação de Cartões  ')).toBe('conciliacao-de-cartoes')
    expect(slugify('!!!')).toBe('block')
  })

  test('nextFreeName numbers duplicates instead of "Copy of"', () => {
    expect(nextFreeName('iFood · GenAI Engineer', ['Base'])).toBe('iFood · GenAI Engineer')
    expect(nextFreeName('Base', ['base', 'Base 2'])).toBe('Base 3')
    expect(nextFreeName('visio', ['visio'], '-')).toBe('visio-2')
  })

  test('jobLabel shows the role alone when there is no company', () => {
    expect(jobLabel({ company: ' iFood ', role: 'GenAI Engineer' })).toBe('iFood · GenAI Engineer')
    expect(jobLabel({ company: '', role: 'Tool Builder' })).toBe('Tool Builder')
  })
})

describe('draftVersionInput', () => {
  const base = { blockId: 'b1', newBlock: null, name: 'Job', title: 'Title', bullets: [{ kind: 'PROJECT', text: 'Built X.', want: null }], waitingOn: null }

  test('accepts a new version or a new block', () => {
    expect(draftVersionInput.safeParse(base).success).toBe(true)
    const block = { ...base, blockId: null, newBlock: { name: 'RAG', section: 'PROJECT', org: '', location: '', dates: '', stack: '' } }
    expect(draftVersionInput.safeParse(block).success).toBe(true)
  })

  test('refuses both or neither, waiting drafts, and unknown kinds', () => {
    expect(draftVersionInput.safeParse({ ...base, blockId: null }).success).toBe(false)
    expect(draftVersionInput.safeParse({ ...base, waitingOn: 'q1' }).success).toBe(false)
    expect(draftVersionInput.safeParse({ ...base, bullets: [{ kind: 'HYPE', text: 'x' }] }).success).toBe(false)
  })
})

describe('error messages', () => {
  test('invalidInput names the field', () => {
    const r = z.object({ role: z.string().min(1, 'Give the job a role.') }).safeParse({ role: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(invalidInput(r.error)).toBe('role: Give the job a role.')
  })

  test('plainDbError maps Prisma codes to plain words', () => {
    expect(plainDbError({ code: 'P2025' })).toBe(DB_MESSAGES.gone)
    expect(plainDbError({ code: 'P2002' }, 'Taken.')).toBe('Taken.')
    expect(plainDbError({ code: 'P1001' })).toBe(DB_MESSAGES.down)
    expect(plainDbError(new Error('x'))).toBe(DB_MESSAGES.unknown)
  })
})

import { describe, expect, test } from 'vitest'
import { experienceFromBlock, hasWork, pairingDoneMessage, pairingSummary, planPairing } from './pairing-plan'

describe('pairingSummary', () => {
  test('names the experiences with no block and the blocks with no experience', () => {
    expect(pairingSummary({ needBlock: ['Apply For Me', 'Projeto Incentivo Ao Voto'], needNotes: ['X'], needExperience: ['Termo'] })).toBe(
      '2 experiences have no block: Apply For Me, Projeto Incentivo Ao Voto. 1 block has no experience: Termo.',
    )
  })

  test('is empty when everything is paired (experiences waiting for notes do not count)', () => {
    expect(pairingSummary({ needBlock: [], needNotes: ['X'], needExperience: [] })).toBe('')
  })
})

describe('pairingDoneMessage', () => {
  const none = { linked: [], blocksMade: [], experiencesMade: [], needNotes: [], waitingForAi: [], failed: [] }

  test('says which blocks were linked to the experience of the same name', () => {
    expect(pairingDoneMessage({ ...none, linked: ['Termo'] })).toBe('Linked Termo to the experience of the same name.')
  })

  test('says what was made', () => {
    expect(pairingDoneMessage({ ...none, blocksMade: ['Apply For Me'], experiencesMade: ['Termo', 'IAAS!'] })).toBe(
      'Made 1 block (Apply For Me) and 2 experiences (Termo, IAAS!). Edit them in Blocks and here.',
    )
  })

  test('says what failed and what waits for the AI key', () => {
    expect(pairingDoneMessage({ ...none, failed: ['Apply For Me'], waitingForAi: ['Vira Voto'] })).toBe(
      'Nothing new was made. Couldn’t make: Apply For Me. Try again. The AI key is missing, so Vira Voto still has no block.',
    )
  })
})

const exp = (id: string, notes: string, blockIds: string[] = []) => ({ id, title: id, notes, blockIds })

describe('planPairing', () => {
  test('an experience with notes and no block needs a block', () => {
    const plan = planPairing([exp('Apply For Me', 'Built an AI CV app'), exp('Visio', 'Intern', ['b1'])], [{ id: 'b1', name: 'Visio AI', experienceId: 'Visio' }])
    expect(plan.needBlock.map((e) => e.id)).toEqual(['Apply For Me'])
    expect(plan.needExperience).toEqual([])
  })

  test('an experience with nothing written waits for notes instead of getting a block', () => {
    const plan = planPairing([exp('Empty', '   ')], [])
    expect(plan.needBlock).toEqual([])
    expect(plan.needNotes.map((e) => e.id)).toEqual(['Empty'])
    expect(hasWork(plan)).toBe(false)
  })

  test('a block linked to no experience needs an experience', () => {
    const plan = planPairing([], [{ id: 'b1', name: 'Termo', experienceId: null }])
    expect(plan.needExperience.map((b) => b.name)).toEqual(['Termo'])
    expect(hasWork(plan)).toBe(true)
  })

  test('a block with no experience links to a blockless experience of the same name instead of making a second one', () => {
    const plan = planPairing([exp('termo ', '')], [{ id: 'b1', name: 'Termo', experienceId: null }])
    expect(plan.link).toEqual([{ block: { id: 'b1', name: 'Termo', experienceId: null }, experience: exp('termo ', '') }])
    expect(plan.needExperience).toEqual([])
    expect(plan.needNotes).toEqual([])
    expect(hasWork(plan)).toBe(true)
  })

  test('nothing to do when every experience and block is paired', () => {
    expect(hasWork(planPairing([exp('Visio', 'x', ['b1'])], [{ id: 'b1', name: 'Visio AI', experienceId: 'Visio' }]))).toBe(false)
  })
})

describe('experienceFromBlock', () => {
  const block = {
    name: ' Termo ',
    org: 'AI & Automation project',
    location: 'São Carlos, SP',
    dates: '2024',
    stack: 'Python, n8n',
    base: {
      title: 'Termo — word game solver',
      bullets: [
        { kind: 'PROJECT', text: 'Built a solver for Termo.' },
        { kind: 'MISSING', text: 'IMPACT?' },
        { kind: 'IMPACT', text: '  ' },
      ],
    },
  }

  test('copies the block’s fields and printed text word for word', () => {
    expect(experienceFromBlock(block)).toEqual({
      title: 'Termo',
      where: 'AI & Automation project · São Carlos, SP',
      when: '2024',
      notes: 'From the block “Termo”:\nTitle on my CV: Termo — word game solver\n- Built a solver for Termo.\nStack: Python, n8n',
    })
  })

  test('a block with no text gives an experience with empty notes', () => {
    expect(experienceFromBlock({ name: 'X', org: '', location: '', dates: '', stack: '', base: null })).toEqual({ title: 'X', where: '', when: '', notes: '' })
  })
})

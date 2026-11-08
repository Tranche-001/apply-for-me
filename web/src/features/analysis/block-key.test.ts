import { describe, expect, test } from 'vitest'
import { blockKey, inOrder, newBlockKey } from './block-key'

describe('blockKey', () => {
  test('a library block is its id', () => {
    expect(blockKey({ blockId: 'b1', newBlock: null })).toBe('b1')
  })

  test('a new block is its name, trimmed and in lower case', () => {
    expect(blockKey({ blockId: null, newBlock: { name: '  Kafka Pipeline ' } })).toBe('new:kafka pipeline')
    expect(newBlockKey('Kafka Pipeline')).toBe('new:kafka pipeline')
  })
})

describe('inOrder', () => {
  const rows = ['a', 'b', 'c', 'd'].map((key) => ({ key }))
  const keys = (list: { key: string }[]) => list.map((r) => r.key)

  test('follows the order given', () => {
    expect(keys(inOrder(rows, (r) => r.key, ['c', 'a', 'd', 'b']))).toEqual(['c', 'a', 'd', 'b'])
  })

  test('ignores unknown keys and repeats', () => {
    expect(keys(inOrder(rows, (r) => r.key, ['ghost', 'c', 'c', 'b', 'a', 'd']))).toEqual(['c', 'b', 'a', 'd'])
  })

  test('items the order does not name follow, in their current order', () => {
    expect(keys(inOrder(rows, (r) => r.key, ['d', 'b']))).toEqual(['d', 'b', 'a', 'c'])
  })

  test('no order leaves them as they are', () => {
    expect(keys(inOrder(rows, (r) => r.key, undefined))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('does not change its input', () => {
    const before = JSON.stringify(rows)
    inOrder(rows, (r) => r.key, ['d'])
    expect(JSON.stringify(rows)).toBe(before)
  })
})

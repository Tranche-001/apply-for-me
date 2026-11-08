import { describe, expect, test } from 'vitest'
import seed from '../../../prisma/seed-data.json'
import { isLearnedFromUse } from './types'

describe('isLearnedFromUse', () => {
  test('a rule from a request made while using the app is learned from use', () => {
    expect(isLearnedFromUse('From your request on Nov 8')).toBe(true)
  })

  test('rules from the CV files, from edits or added by hand are not', () => {
    expect(isLearnedFromUse('From your LaTeX CVs')).toBe(false)
    expect(isLearnedFromUse('You added this')).toBe(false)
    expect(isLearnedFromUse('')).toBe(false)
  })
})

describe('seed rules', () => {
  const ORDER_AND_TITLES = [
    'Put experience at companies before personal projects.',
    'Put the most recent work that best matches the job at the top.',
    "Offer the job's title for my roles, and ask me before using it.",
  ]

  test('the order and role-title rules are cv rules, on, at the end of the group, from the request of Nov 8', () => {
    const cv = seed.rules.filter((r) => r.group === 'cv').sort((a, b) => a.position - b.position)
    expect(cv.slice(-3).map((r) => r.text)).toEqual(ORDER_AND_TITLES)
    for (const r of cv.slice(-3)) expect(r).toMatchObject({ on: true, source: 'From your request on Nov 8' })
  })
})

import { describe, expect, test } from 'vitest'
import seed from '../../../prisma/seed-data.json'
import { filterRules, isLearnedFromUse, newRuleTexts, reviewRuleSource, ruleOrigin, type RuleItem } from './types'

describe('ruleOrigin', () => {
  test('rules the app wrote while you used it are learned from use', () => {
    expect(ruleOrigin('From your request on Nov 8')).toBe('learned')
    expect(ruleOrigin('Learned from your review of iFood · AI Builder')).toBe('learned')
    expect(ruleOrigin('From 1 edit, see the right')).toBe('learned')
    expect(ruleOrigin('From 3 edits')).toBe('learned')
  })

  test('rules you wrote are yours; the rest came with the app', () => {
    expect(ruleOrigin('You added this')).toBe('you')
    expect(ruleOrigin('From your LaTeX CVs')).toBe('app')
    expect(ruleOrigin('')).toBe('app')
  })

  test('isLearnedFromUse is the learned origin', () => {
    expect(isLearnedFromUse('From your request on Nov 8')).toBe(true)
    expect(isLearnedFromUse('From your LaTeX CVs')).toBe(false)
    expect(isLearnedFromUse('You added this')).toBe(false)
  })
})

describe('filterRules', () => {
  const rule = (id: string, source: string): RuleItem => ({ id, group: 'cv', text: id, source, on: true, position: 0 })
  const rules = [rule('a', 'From your LaTeX CVs'), rule('b', 'Learned from your review of iFood · AI Builder'), rule('c', 'You added this'), rule('d', 'From 1 edit')]

  test('All shows every rule; the other filters show one origin', () => {
    expect(filterRules(rules, 'all').map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(filterRules(rules, 'learned').map((r) => r.id)).toEqual(['b', 'd'])
    expect(filterRules(rules, 'app').map((r) => r.id)).toEqual(['a'])
  })
})

describe('reviewRuleSource', () => {
  test('names the job reviewed, within the 200 characters a source may have', () => {
    expect(reviewRuleSource('iFood · AI Builder')).toBe('Learned from your review of iFood · AI Builder')
    expect(reviewRuleSource('x'.repeat(400)).length).toBeLessThanOrEqual(200)
  })
})

describe('newRuleTexts', () => {
  test('drops texts a rule already has (case, spaces, quotes and the final stop ignored) and repeats', () => {
    const existing = ['Put experience at companies before personal projects.']
    const out = newRuleTexts(['put experience at companies  before personal projects', ' Use the job’s title.', "Use the job's title", ''], existing)
    expect(out).toEqual(['Use the job’s title.'])
  })

  test('keeps at most 3 rules of at most 500 characters', () => {
    expect(newRuleTexts(['a', 'b', 'c', 'd'], [])).toEqual(['a', 'b', 'c'])
    expect(newRuleTexts(['x'.repeat(600)], [])[0].length).toBe(500)
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

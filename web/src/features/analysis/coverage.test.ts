import { describe, expect, it } from 'vitest'
import type { AnalysisDraft, JobAnalysis, JobRequirement, RequirementMatch, ReusedVersion } from '../ai/types'
import { blockRequirements, cvRequirements, jobReqLine, requirementCountLabel } from './coverage'

const req = (id: string, text: string, status: JobRequirement['status'] = 'covered'): JobRequirement => ({
  id,
  text,
  status,
  evidence: '',
  quotes: [],
  keys: [],
})

const requirements: JobRequirement[] = [
  req('pyts', 'Python and TypeScript'),
  req('rag', 'RAG and vector search', 'partial'),
  req('kafka', 'Kafka', 'missing'),
]

const m = (requirementId: string, phrases: string[] = ['x'], partly = false): RequirementMatch => ({ requirementId, phrases, partly })

describe('blockRequirements', () => {
  it('joins matches with their requirements and skips unknown ids', () => {
    const list = blockRequirements([m('pyts', ['Python processing']), m('ghost'), m('rag', ['pgvector'], true)], requirements)
    expect(list).toEqual([
      { requirement: requirements[0], phrases: ['Python processing'], partly: false },
      { requirement: requirements[1], phrases: ['pgvector'], partly: true },
    ])
  })

  it('returns an empty list without matches', () => {
    expect(blockRequirements([], requirements)).toEqual([])
  })
})

describe('requirementCountLabel', () => {
  const full = (n: number) => Array.from({ length: n }, (_, i) => ({ requirement: req(`f${i}`, ''), phrases: [], partly: false }))
  const part = (n: number) => Array.from({ length: n }, (_, i) => ({ requirement: req(`p${i}`, ''), phrases: [], partly: true }))

  it.each([
    [full(1), false, '1 requirement'],
    [full(3), false, '3 requirements'],
    [[...full(2), ...part(1)], false, '2 requirements + 1 partly'],
    [[...full(1), ...part(1)], true, 'Would match 1 requirement + 1 partly'],
    [[], false, 'No requirement'],
    [[], true, 'No requirement'],
    [part(2), false, '2 requirements, partly'],
    [part(1), false, '1 requirement, partly'],
    [part(1), true, 'Would match 1 requirement, partly'],
  ])('%j wouldMatch=%s -> %s', (list, wouldMatch, expected) => {
    expect(requirementCountLabel(list, { wouldMatch })).toBe(expected)
  })
})

describe('cvRequirements', () => {
  const analysis = { requirements } as JobAnalysis

  it('splits met and not met using the kept blocks', () => {
    const kept = [
      { id: 'v1', blockName: 'Visio AI', matches: [m('rag', ['pgvector'])] },
      { id: 'v2', blockName: 'Semcomp', matches: [m('pyts', ['React, TypeScript']), m('ghost')] },
    ]
    const result = cvRequirements(analysis, kept)
    expect(result.met.map((x) => x.requirement.id)).toEqual(['pyts', 'rag'])
    expect(result.met[1].hits).toEqual([{ id: 'v1', blockName: 'Visio AI', phrases: ['pgvector'], partly: false }])
    expect(result.notMet).toEqual([requirements[2]])
  })

  it('counts a partly-only requirement as met, flagged partly', () => {
    const result = cvRequirements(analysis, [{ id: 'v1', blockName: 'Docker app', matches: [m('kafka', ['Docker'], true)] }])
    expect(result.met).toHaveLength(1)
    expect(result.met[0].partly).toBe(true)
    expect(result.notMet.map((r) => r.id)).toEqual(['pyts', 'rag'])
  })

  it('is not partly when at least one hit is full', () => {
    const result = cvRequirements(analysis, [
      { id: 'a', blockName: 'A', matches: [m('kafka', ['a'], true)] },
      { id: 'b', blockName: 'B', matches: [m('kafka', ['b'])] },
    ])
    expect(result.met[0].partly).toBe(false)
    expect(result.met[0].hits.map((h) => h.id)).toEqual(['a', 'b'])
  })

  it('has everything not met when no block is kept', () => {
    const result = cvRequirements(analysis, [])
    expect(result.met).toEqual([])
    expect(result.notMet).toEqual(requirements)
  })

  it('a requirement your profile shows is met, even with no block; the profile is named by its section', () => {
    const withProfile = { requirements, profile: [edu('kafka', false), edu('rag', true)] } as JobAnalysis
    const result = cvRequirements(withProfile, [])
    expect(result.met.map((x) => x.requirement.id)).toEqual(['rag', 'kafka'])
    expect(result.met[1]).toEqual({ requirement: requirements[2], hits: [{ id: 'profile-0', blockName: 'Education', phrases: ['Information Systems'], partly: false }], partly: false })
    expect(result.met[0].partly).toBe(true)
  })
})

const edu = (requirementId: string, partly: boolean) => ({ requirementId, kind: 'education' as const, title: 'B.S. Information Systems', dates: '', detail: '', phrases: ['Information Systems'], partly })

describe('jobReqLine', () => {
  const reused = { versionId: 'vr1', blockName: 'Visio AI', matches: [m('pyts')] } as unknown as ReusedVersion
  const leftOut = { versionId: 'vl1', blockName: 'Termo', matches: [m('pyts')] } as unknown as ReusedVersion
  const draft = { key: 'd1', blockName: 'BI Dashboard', matches: [m('pyts'), m('rag')] } as unknown as AnalysisDraft
  const analysisFull = {
    requirements,
    asks: [
      { id: 'a1', text: 'q', requirementId: 'rag' },
      { id: 'a2', text: 'q', requirementId: 'kafka' },
    ],
    drafts: [draft],
    reused: [reused],
    leftOut: [leftOut],
  } as unknown as JobAnalysis
  const nameOf = (id: string) => ({ vr1: 'Visio AI', vl1: 'Termo', d1: 'BI Dashboard' })[id] ?? id

  it('lists the blocks that show a covered requirement after drafting', () => {
    expect(jobReqLine('covered', 'pyts', analysisFull, 'after', nameOf)).toBe('Visio AI, BI Dashboard')
  })

  it('before the answers counts the versions used as they are, the early drafts and the ones left out', () => {
    expect(jobReqLine('covered', 'pyts', analysisFull, 'before', nameOf)).toBe('Visio AI, BI Dashboard, Termo')
  })

  it('names the question that asks about a gap', () => {
    expect(jobReqLine('partial', 'rag', analysisFull, 'before', nameOf)).toBe('BI Dashboard · Q1 asks about it')
    expect(jobReqLine('missing', 'kafka', analysisFull, 'before', nameOf)).toBe('Nothing in your blocks yet · Q2 asks about it')
  })

  it('shows the blocks and the question for a partial requirement', () => {
    const a = { ...analysisFull, reused: [{ ...reused, matches: [m('rag', [], true)] }] } as JobAnalysis
    expect(jobReqLine('partial', 'rag', a, 'before', nameOf)).toBe('Visio AI, BI Dashboard · Q1 asks about it')
  })

  it('after the answers a partial requirement names its blocks and says partly', () => {
    expect(jobReqLine('partial', 'rag', analysisFull, 'after', nameOf)).toBe('BI Dashboard · partly')
  })

  it('omits the question when none asks', () => {
    const a = { ...analysisFull, asks: [] } as JobAnalysis
    expect(jobReqLine('missing', 'kafka', a, 'before', nameOf)).toBe('Nothing in your blocks yet')
  })

  it('names your profile’s section when it shows the requirement', () => {
    const a = { ...analysisFull, profile: [edu('kafka', false)] } as JobAnalysis
    expect(jobReqLine('covered', 'kafka', a, 'after', nameOf)).toBe('Education')
    expect(jobReqLine('covered', 'pyts', { ...analysisFull, profile: [{ ...edu('pyts', false), kind: 'skills' }] } as JobAnalysis, 'after', nameOf)).toBe('Visio AI, BI Dashboard, Technical Skills')
  })

  it('says to add an experience after drafting when still not covered', () => {
    expect(jobReqLine('missing', 'kafka', analysisFull, 'after', nameOf)).toBe('You don’t have it · add an experience')
  })
})

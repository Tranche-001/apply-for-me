import { describe, expect, it } from 'vitest'
import { findJobByLabel, guessLinkKind, isValidUrl, jobLabel, jobMatches, linkText, nextLinkKind, normalizeUrl, splitJobQuery } from './links'

describe('job links', () => {
  it('shortens known hosts and strips www', () => {
    expect(linkText('https://www.linkedin.com/jobs/view/123')).toBe('LinkedIn')
    expect(linkText('https://ifood.gupy.io/job/1')).toBe('Gupy')
    expect(linkText('https://www.amazon.jobs/en/jobs/1')).toBe('amazon.jobs')
  })

  it('adds https:// and accepts only full links', () => {
    expect(normalizeUrl(' nubank.com.br/careers ')).toBe('https://nubank.com.br/careers')
    expect(normalizeUrl('')).toBe('')
    expect(isValidUrl('https://nubank.com.br/careers')).toBe(true)
    expect(isValidUrl('https://nubank')).toBe(false)
    expect(isValidUrl('ftp://nubank.com')).toBe(false)
  })

  it('guesses the type for job boards and application systems only', () => {
    expect(guessLinkKind('https://www.linkedin.com/jobs/1')).toBe('POSTING')
    expect(guessLinkKind('https://boards.greenhouse.io/x')).toBe('APPLICATION')
    expect(guessLinkKind('https://nubank.com.br')).toBeNull()
  })

  it('offers the next unused link type', () => {
    expect(nextLinkKind(['POSTING'])).toBe('APPLICATION')
    expect(nextLinkKind(['POSTING', 'APPLICATION', 'COMPANY'])).toBe('OTHER')
  })
})

describe('job names', () => {
  it('joins company and role, or uses whichever exists', () => {
    expect(jobLabel('iFood', 'GenAI Engineer')).toBe('iFood · GenAI Engineer')
    expect(jobLabel('', 'Tool Builder')).toBe('Tool Builder')
  })

  it('catches a duplicate whatever the case', () => {
    const jobs = [{ label: 'iFood · GenAI Engineer' }]

    expect(findJobByLabel(jobs, 'ifood · genai engineer')).toBe(jobs[0])
    expect(findJobByLabel(jobs, 'iFood')).toBeNull()
  })

  it('splits a search like "Nubank · Backend" into company and role', () => {
    expect(splitJobQuery('Nubank · Backend Engineer')).toEqual({ company: 'Nubank', role: 'Backend Engineer' })
    expect(splitJobQuery('Nubank')).toEqual({ company: 'Nubank', role: '' })
  })

  it('searches by company, role or link', () => {
    const job = { label: 'AWS · Software Developer', links: [{ url: 'https://www.amazon.jobs/' }] }

    expect(jobMatches(job, 'amazon')).toBe(true)
    expect(jobMatches(job, 'developer')).toBe(true)
    expect(jobMatches(job, 'ifood')).toBe(false)
  })
})

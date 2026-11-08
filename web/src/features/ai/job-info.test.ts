import { describe, expect, test } from 'vitest'
import { jobNamesFrom } from './job-info'

describe('jobNamesFrom', () => {
  test('keeps both when the AI found both', () => {
    expect(jobNamesFrom({ company: 'Acme', role: 'SRE' }, null)).toEqual({ company: 'Acme', role: 'SRE' })
  })

  test('an empty company falls back to the role alone', () => {
    expect(jobNamesFrom({ company: '', role: 'SRE' }, null)).toEqual({ company: '', role: 'SRE' })
  })

  test('an empty role falls back to the page title', () => {
    expect(jobNamesFrom({ company: 'Acme', role: '' }, ' Senior SRE - Acme ')).toEqual({ company: 'Acme', role: 'Senior SRE - Acme' })
  })

  test('no role and no title is not a job', () => {
    expect(jobNamesFrom({ company: 'Acme', role: '' }, null)).toBeNull()
    expect(jobNamesFrom({ company: '', role: '' }, '  ')).toBeNull()
  })
})

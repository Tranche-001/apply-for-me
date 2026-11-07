import { describe, expect, it } from 'vitest'
import {
  addedToLabel,
  blockMatchTitle,
  blocksSummary,
  bulletTag,
  cvShowsLabel,
  discardedLabel,
  gapHint,
  improvesLabel,
  metBlocksLine,
  metCountLine,
  requirementTopic,
  reviewBlockSub,
  reviewBlockTag,
  saveLabel,
  savedBannerText,
} from './review-labels'

describe('blocksSummary', () => {
  it('counts new versions, new blocks and blocks used as they are', () => {
    expect(blocksSummary(['new-version', 'as-is', 'as-is', 'as-is'])).toBe('1 new version · 3 as is')
    expect(blocksSummary(['new-version', 'new-version', 'new-block', 'as-is', 'as-is', 'as-is'])).toBe('2 new versions · 1 new block · 3 as is')
    expect(blocksSummary(['new-block', 'new-block'])).toBe('2 new blocks')
  })

  it('says "Nothing yet" when there is no block', () => {
    expect(blocksSummary([])).toBe('Nothing yet')
  })
})

describe('discardedLabel', () => {
  it('names the block that was discarded or left out', () => {
    expect(discardedLabel('BI Dashboard', 'discard')).toBe('Discarded BI Dashboard.')
    expect(discardedLabel('IAAS!', 'leave-out')).toBe('Left IAAS! out of this CV.')
  })
})

describe('improvesLabel', () => {
  it('names the question that can fill the gap', () => {
    expect(improvesLabel(1)).toBe('Q1 can improve it')
  })
})

describe('bulletTag', () => {
  it('uses the P / S / I tag and its tone', () => {
    expect(bulletTag({ kind: 'PROJECT' })).toEqual({ label: 'P', tone: 'k-P' })
    expect(bulletTag({ kind: 'STACK' })).toEqual({ label: 'S', tone: 'k-S' })
    expect(bulletTag({ kind: 'IMPACT' })).toEqual({ label: 'I', tone: 'k-I' })
    expect(bulletTag({ kind: 'PROJECT_STACK' })).toEqual({ label: 'P·S', tone: 'k-P' })
    expect(bulletTag({ kind: 'PROJECT_IMPACT' })).toEqual({ label: 'P·I', tone: 'k-P' })
    expect(bulletTag({ kind: 'STACK_IMPACT' })).toEqual({ label: 'S·I', tone: 'k-S' })
  })

  it('shows a gap with the kind it wants, in amber', () => {
    expect(bulletTag({ kind: 'MISSING', want: 'PROJECT_STACK' })).toEqual({ label: 'P·S', tone: 'k-M' })
    expect(bulletTag({ kind: 'MISSING', want: null })).toEqual({ label: 'I', tone: 'k-M' })
    expect(bulletTag({ kind: 'MISSING' })).toEqual({ label: 'I', tone: 'k-M' })
  })
})

describe('gapHint', () => {
  it('puts the gap note in brackets', () => {
    expect(gapHint({ text: 'RAG or vector search: your answer to Q1 can fill this' })).toBe('[RAG or vector search: your answer to Q1 can fill this]')
  })

  it('asks for the impact when the gap has no note', () => {
    expect(gapHint({ text: '  ' })).toBe('[Impact: what came out of it?]')
  })
})

describe('reviewBlockSub', () => {
  const three = [{ partly: false }, { partly: false }, { partly: false }]

  it('new blocks: the count and the note', () => {
    expect(reviewBlockSub({ group: 'new', matches: three, note: 'Leads with RAG and pgvector' })).toBe('3 requirements · Leads with RAG and pgvector')
    expect(reviewBlockSub({ group: 'new', matches: [], note: null })).toBe('No requirement')
  })

  it('blocks as they are: the count and the version used', () => {
    expect(reviewBlockSub({ group: 'asis', matches: [{ partly: false }], versionName: 'Web Full-Stack' })).toBe('1 requirement · version “Web Full-Stack”')
    expect(reviewBlockSub({ group: 'asis', matches: [], versionName: 'Web Full-Stack' })).toBe('No requirement · version “Web Full-Stack”')
  })

  it('blocks left out: what they would match, nothing else', () => {
    expect(reviewBlockSub({ group: 'out', matches: [{ partly: false }, { partly: true }], versionName: 'Base', note: 'ignored' })).toBe('Would match 1 requirement + 1 partly')
  })
})

describe('reviewBlockTag', () => {
  it('tags only the blocks new for this job', () => {
    expect(reviewBlockTag('new', false)).toBe('NEW VERSION')
    expect(reviewBlockTag('new', true)).toBe('NEW BLOCK')
    expect(reviewBlockTag('asis', false)).toBeNull()
    expect(reviewBlockTag('out', true)).toBeNull()
  })
})

describe('review counts', () => {
  it('metCountLine says how many requirements the CV meets', () => {
    expect(metCountLine(6, 7)).toBe('· 6 of 7 met')
  })

  it('metBlocksLine names each block once', () => {
    expect(metBlocksLine([{ blockName: 'Visio AI' }, { blockName: 'BI Dashboard' }, { blockName: 'Visio AI' }])).toBe('Visio AI, BI Dashboard')
  })

  it('saveLabel counts the versions to save', () => {
    expect(saveLabel(3)).toBe('Save 3 versions and the CV')
    expect(saveLabel(1)).toBe('Save 1 version and the CV')
    expect(saveLabel(0)).toBe('Save the CV')
  })

  it('savedBannerText says what was saved and for which job', () => {
    expect(savedBannerText(3, 'ExampleCo · Senior GenAI Engineer')).toBe('✓ Saved 3 to your library and the CV for ExampleCo · Senior GenAI Engineer.')
    expect(savedBannerText(0, 'ExampleCo · Senior GenAI Engineer')).toBe('✓ Saved the CV for ExampleCo · Senior GenAI Engineer.')
  })
})

describe('popover labels', () => {
  it('blockMatchTitle: matches, would match, or none', () => {
    expect(blockMatchTitle([{ partly: false }, { partly: false }, { partly: false }], false)).toBe('Matches 3 requirements')
    expect(blockMatchTitle([{ partly: false }, { partly: true }], true)).toBe('Would match 1 requirement + 1 partly')
    expect(blockMatchTitle([], false)).toBe('No requirement of this job')
  })

  it('cvShowsLabel counts the blocks', () => {
    expect(cvShowsLabel(3)).toBe('Your CV shows it · 3 blocks')
    expect(cvShowsLabel(1)).toBe('Your CV shows it · 1 block')
  })

  it('requirementTopic joins the first two posting keys, else uses the requirement', () => {
    expect(requirementTopic({ text: 'Event streaming with Kafka', keys: ['Kafka', 'event streaming', 'streams'] })).toBe('Kafka or event streaming')
    expect(requirementTopic({ text: 'Event streaming with Kafka', keys: ['Kafka', 'kafka'] })).toBe('Kafka')
    expect(requirementTopic({ text: 'Event streaming with Kafka', keys: [] })).toBe('Event streaming with Kafka')
  })

  it('addedToLabel marks a new experience', () => {
    expect(addedToLabel('Visio AI', false)).toBe('✓ Added to Visio AI.')
    expect(addedToLabel('Kafka side project', true)).toBe('✓ Added to Kafka side project (new).')
  })
})

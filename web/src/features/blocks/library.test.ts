import { describe, expect, it } from 'vitest'
import type { LibBlock, LibVersion } from './types'
import { EMPTY_OVERLAY, applyOverlay, blockMatches, themeCounts, versionMatches, withVersions } from './library'

function version(id: string, blockId: string, extra: Partial<LibVersion> = {}): LibVersion {
  return { id, blockId, name: id, title: `Title ${id}`, isBase: false, themes: [], position: 0, bullets: [], jobIds: [], ...extra }
}

function block(id: string, versions: LibVersion[], extra: Partial<LibBlock> = {}): LibBlock {
  return { id, slug: id, name: id, section: 'EXPERIENCE', org: '', location: '', dates: '', stack: '', position: 0, versions, ...extra }
}

const iaas = block('iaas', [version('base', 'iaas', { isBase: true, themes: ['Full-stack', 'Security'] }), version('fin', 'iaas', { themes: ['Fintech', 'Full-stack'], jobIds: ['j1'] })], { org: 'IAAS!' })
const termo = block('termo', [version('t', 'termo', { themes: ['DevOps'], bullets: [{ kind: 'PROJECT', text: 'Shipped a word game', want: null }] })], { section: 'PROJECT', stack: 'React, Django' })
const filter = { query: '', themes: [] as string[], mode: 'any' as const, jobLabels: { j1: 'iFood · GenAI Engineer' } }

describe('applyOverlay', () => {
  it('shows a version you just saved before the server copy has it, and replaces an updated one', () => {
    const overlay = withVersions(EMPTY_OVERLAY, [version('new', 'iaas'), { ...iaas.versions[1], title: 'Changed' }])

    const [merged] = applyOverlay([iaas], overlay)

    expect(merged.versions.map((v) => v.id)).toEqual(['base', 'fin', 'new'])
    expect(merged.versions[1].title).toBe('Changed')
  })

  it('adds new blocks, hides merged versions and follows your order', () => {
    const overlay = { ...EMPTY_OVERLAY, blocks: [termo], removed: ['fin'], order: ['termo', 'iaas'] }

    const merged = applyOverlay([iaas], overlay)

    expect(merged.map((b) => b.id)).toEqual(['termo', 'iaas'])
    expect(merged[1].versions.map((v) => v.id)).toEqual(['base'])
  })

  it('returns the server copy untouched when there is nothing on top', () => {
    expect(applyOverlay([iaas], EMPTY_OVERLAY)[0]).toBe(iaas)
  })
})

describe('search and themes', () => {
  it('finds a version by company, job name or bullet text', () => {
    expect(versionMatches(iaas, iaas.versions[1], { ...filter, query: 'ifood' })).toBe(true)
    expect(versionMatches(iaas, iaas.versions[0], { ...filter, query: 'ifood' })).toBe(false)
    expect(versionMatches(iaas, iaas.versions[0], { ...filter, query: 'iaas' })).toBe(true)
    expect(versionMatches(termo, termo.versions[0], { ...filter, query: 'word game' })).toBe(true)
  })

  it('filters by any or all of the chosen themes', () => {
    const themes = ['Fintech', 'Security']

    expect(versionMatches(iaas, iaas.versions[0], { ...filter, themes })).toBe(true)
    expect(versionMatches(iaas, iaas.versions[0], { ...filter, themes, mode: 'all' })).toBe(false)
  })

  it('counts themes, most used first', () => {
    expect(themeCounts([iaas, termo])).toEqual([
      { theme: 'Full-stack', count: 2 },
      { theme: 'DevOps', count: 1 },
      { theme: 'Fintech', count: 1 },
      { theme: 'Security', count: 1 },
    ])
  })

  it('searches blocks to add by name, stack or theme', () => {
    expect(blockMatches(termo, 'django')).toBe(true)
    expect(blockMatches(iaas, 'fintech')).toBe(true)
    expect(blockMatches(iaas, 'mobile')).toBe(false)
  })
})

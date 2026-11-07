import { describe, expect, it } from 'vitest'
import type { LibVersion } from './types'
import {
  blockContext,
  draftChanged,
  fromEditorBullets,
  identicalTo,
  kindAbbr,
  pickerOrder,
  toEditorBullets,
  uniqueName,
} from './bullets'

const version = {
  title: 'Web Developer — Semcomp',
  bullets: [
    { kind: 'STACK_IMPACT' as const, text: 'Built email confirmation for 500+ attendees', want: null },
    { kind: 'MISSING' as const, text: 'No project bullet yet. What was the site for?', want: 'PROJECT' as const },
  ],
}

function lib(id: string, extra: Partial<LibVersion> = {}): LibVersion {
  return { id, blockId: 'b', name: id, title: 'T', isBase: false, themes: [], position: 0, bullets: [], jobIds: [], ...extra }
}

describe('editor bullets', () => {
  it('opens a gap as an empty bullet of the missing kind', () => {
    const [, gap] = toEditorBullets(version.bullets, (i) => `b${i}`)

    expect(gap).toEqual({ id: 'b1', kind: 'PROJECT', text: '', want: 'PROJECT', gapText: 'No project bullet yet. What was the site for?' })
  })

  it('keeps a gap left empty as a gap, and drops other empty bullets', () => {
    const bullets = [...toEditorBullets(version.bullets, (i) => `b${i}`), { id: 'x', kind: 'IMPACT' as const, text: '  ', want: null, gapText: '' }]

    expect(fromEditorBullets(bullets)).toEqual(version.bullets)
  })

  it('fills a gap when you write it', () => {
    const bullets = toEditorBullets(version.bullets, (i) => `b${i}`).map((b) => (b.want ? { ...b, text: 'Owned the event site' } : b))

    expect(fromEditorBullets(bullets)[1]).toEqual({ kind: 'PROJECT', text: 'Owned the event site', want: null })
  })

  it('sees no change until the title or a bullet differs', () => {
    const bullets = toEditorBullets(version.bullets, (i) => `b${i}`)

    expect(draftChanged(version, { title: version.title, bullets })).toBe(false)
    expect(draftChanged(version, { title: 'Web Developer', bullets })).toBe(true)
    expect(draftChanged(version, { title: version.title, bullets: bullets.slice(1) })).toBe(true)
  })
})

describe('tags and names', () => {
  it('abbreviates kinds and marks gaps with a question mark', () => {
    expect(kindAbbr({ kind: 'PROJECT_STACK', want: null })).toBe('P·S')
    expect(kindAbbr({ kind: 'MISSING', want: 'IMPACT' })).toBe('I?')
  })

  it('names a new version after the job, without clashing', () => {
    expect(uniqueName('JackBox', ['Base'])).toBe('JackBox')
    expect(uniqueName('JackBox', ['Base', 'jackbox', 'JackBox 2'])).toBe('JackBox 3')
    expect(uniqueName('  ', [])).toBe('Untitled version')
  })

  it('describes the block context for experiences and projects', () => {
    expect(blockContext({ section: 'EXPERIENCE', org: 'IAAS!', location: 'São Paulo, SP', dates: '2026', stack: '' })).toBe('IAAS! · São Paulo, SP · 2026')
    expect(blockContext({ section: 'PROJECT', org: '', location: '', dates: '', stack: 'React, Django' })).toBe('React, Django')
  })

  it('lists Base first, then the most used versions', () => {
    const order = pickerOrder([lib('a', { position: 0 }), lib('base', { isBase: true, position: 1 }), lib('used', { jobIds: ['j1', 'j2'], position: 2 })])

    expect(order.map((v) => v.id)).toEqual(['base', 'used', 'a'])
  })

  it('flags a version identical to an earlier one', () => {
    const bullets = [{ kind: 'IMPACT' as const, text: 'Same', want: null }]
    const versions = [lib('base', { bullets }), lib('copy', { bullets }), lib('other', { bullets: [{ kind: 'IMPACT', text: 'Else', want: null }] })]

    expect(identicalTo(versions[1], versions)?.id).toBe('base')
    expect(identicalTo(versions[0], versions)).toBeNull()
    expect(identicalTo(versions[2], versions)).toBeNull()
  })
})

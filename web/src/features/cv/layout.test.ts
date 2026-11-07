import { describe, expect, it } from 'vitest'
import type { BulletKind, Section } from '@prisma/client'
import seed from '../../../prisma/seed-data.json'
import type { ProfileData } from '../profile/types'
import {
  METRICS,
  describeFit,
  entryHeight,
  fitOf,
  layoutCv,
  pageLabel,
  profileHeights,
  shorterVersions,
  type LayoutEntry,
  type LayoutSectionInput,
  type PrintBlock,
  type PrintVersion,
} from './layout'

// The real CV text (seed-data.json is the CV files word for word), so the numbers match the design.
type SeedBlock = (typeof seed.blocks)[number]

function printBlock(b: SeedBlock): PrintBlock {
  return { id: b.slug, name: b.name, section: b.section as Section, org: b.org, location: b.location, dates: b.dates, stack: b.stack }
}

function printVersion(v: SeedBlock['versions'][number]): PrintVersion {
  return { id: v.key, name: v.name, title: v.title, bullets: v.bullets.map((x) => ({ kind: x.kind as BulletKind, text: x.text })) }
}

function find(slug: string) {
  const block = seed.blocks.find((b) => b.slug === slug)
  if (!block) throw new Error(`no block ${slug}`)
  return block
}

function entry(slug: string, key: string): LayoutEntry {
  const block = find(slug)
  const version = block.versions.find((v) => v.key === key)
  if (!version) throw new Error(`no version ${key}`)
  return { key: slug, block: printBlock(block), version: printVersion(version), peeked: false }
}

const profile: ProfileData = {
  education: seed.profile.education.map((x, i) => ({ id: `ed${i}`, degree: x.degree, dates: x.dates, school: x.school, location: x.location })),
  skills: seed.profile.skills.map((x, i) => ({ id: `sk${i}`, label: x.label, text: x.text })),
  achievements: seed.profile.achievements.map((x, i) => ({ id: `ac${i}`, title: x.title, description: x.description })),
}

const noProfile: ProfileData = { education: [], skills: [], achievements: [] }

// The iFood · GenAI Engineer draft: projects first, the LLM pipeline version, three experiences, one page.
const ifoodSections: LayoutSectionInput[] = [
  { section: 'PROJECT', entries: [entry('bi', 'bi-llm')] },
  { section: 'EXPERIENCE', entries: [entry('visio', 'visio-base'), entry('rats', 'rats-base'), entry('iaas', 'iaas-base')] },
]
const onePageShow = { showEducation: true, showSkills: true, showAchievements: false }

describe('entryHeight', () => {
  it('leaves gaps (MISSING bullets) out of the printed height', () => {
    // Arrange
    const withGap = entry('semcomp', 'sem-base')
    const withoutGap = { ...withGap.version, bullets: withGap.version.bullets.filter((b) => b.kind !== 'MISSING') }

    // Act / Assert
    expect(entryHeight(withGap.block, withGap.version)).toBe(entryHeight(withGap.block, withoutGap))
  })

  it('gives a project one heading line and an experience a heading plus a meta line', () => {
    const project: PrintBlock = { id: 'p', name: 'P', section: 'PROJECT', org: '', location: '', dates: '', stack: 'React' }
    const experience: PrintBlock = { ...project, section: 'EXPERIENCE' }
    const version: PrintVersion = { id: 'v', name: 'Base', title: 'Short', bullets: [] }

    expect(entryHeight(experience, version) - entryHeight(project, version)).toBeCloseTo(14.9 + 1)
  })
})

describe('layoutCv', () => {
  it('fits the iFood draft on one page, about 97–99% full', () => {
    const layout = layoutCv({ pageLimit: 1, sections: ifoodSections, profile, show: onePageShow })
    const fit = fitOf(layout, 1)

    expect(fit.over).toBe(false)
    expect(layout.pages).toHaveLength(1)
    expect(fit.pct).toBeGreaterThanOrEqual(97)
    expect(fit.pct).toBeLessThanOrEqual(99)
    expect(describeFit(fit).detail).toBe(`Page 1 is ${fit.pct}% full.`)
    expect(pageLabel(0, fit).text).toBe(`Page 1 of 1 · ${fit.pct}% full`)
  })

  it('overflows one page when blocks are added, and names what spills', () => {
    const sections: LayoutSectionInput[] = [
      ifoodSections[0],
      { section: 'EXPERIENCE', entries: [...ifoodSections[1].entries, entry('attendance', 'att-base'), entry('semcomp', 'sem-base')] },
    ]

    const layout = layoutCv({ pageLimit: 1, sections, profile, show: onePageShow })
    const fit = fitOf(layout, 1)

    expect(fit.over).toBe(true)
    expect(layout.pages.length).toBeGreaterThan(1)
    expect(['Attendance Control App', 'Semcomp website', 'Technical Skills']).toContain(layout.spill)
    expect(describeFit(fit).title).toBe('Too long for 1 page')
    expect(describeFit(fit).detail).toContain(`${layout.spill} spills onto page 2.`)
    expect(pageLabel(1, fit)).toEqual({ text: 'Page 2 · over your 1 page limit', beyond: true })
  })

  it('fits every block on two pages (the full CV with achievements)', () => {
    const sections: LayoutSectionInput[] = [
      {
        section: 'EXPERIENCE',
        entries: [entry('visio', 'visio-base'), entry('iaas', 'iaas-fin'), entry('rats', 'rats-base'), entry('attendance', 'att-base'), entry('semcomp', 'sem-base')],
      },
      { section: 'PROJECT', entries: [entry('bi', 'bi-base'), entry('termo', 'termo-base')] },
    ]

    const layout = layoutCv({ pageLimit: 2, sections, profile, show: { showEducation: true, showSkills: true, showAchievements: true } })
    const fit = fitOf(layout, 2)

    expect(fit.over).toBe(false)
    expect(layout.pages).toHaveLength(2)
    expect(layout.spill).toBe('')
    expect(describeFit(fit).title).toBe('Fits on 2 pages')
  })

  it('never splits a block and drops the heading of a section continued on the next page', () => {
    const many = ['visio-base', 'iaas-base', 'rats-base', 'att-base', 'sem-base']
    const slugs = ['visio', 'iaas', 'rats', 'attendance', 'semcomp']
    const entries = [...slugs, ...slugs].map((slug, i) => ({ ...entry(slug, many[i % 5]), key: `${slug}-${i}` }))

    const layout = layoutCv({ pageLimit: 2, sections: [{ section: 'EXPERIENCE', entries }], profile: noProfile, show: onePageShow })

    const placed = layout.pages.flatMap((p) => p.sections.flatMap((s) => (s.kind === 'entries' ? s.entries.map((e) => e.key) : [])))
    expect(placed).toEqual(entries.map((e) => e.key))
    const first = layout.pages[0].sections[0]
    const continued = layout.pages[1].sections[0]
    expect(first.kind === 'entries' && first.heading).toBe(true)
    expect(continued.kind === 'entries' && continued.heading).toBe(false)
  })

  it('leaves empty sections and switched-off profile sections off the CV', () => {
    const layout = layoutCv({
      pageLimit: 1,
      sections: [
        { section: 'EXPERIENCE', entries: [] },
        { section: 'PROJECT', entries: [entry('termo', 'termo-base')] },
      ],
      profile,
      show: { showEducation: false, showSkills: true, showAchievements: false },
    })

    const kinds = layout.pages[0].sections.map((s) => (s.kind === 'entries' ? s.section : s.kind))
    expect(kinds).toEqual(['PROJECT', 'skills'])
  })

  it('treats an empty profile list as off', () => {
    expect(profileHeights(noProfile, { showEducation: true, showSkills: true, showAchievements: true })).toEqual({ edu: 0, skills: 0, ach: 0 })
  })

  it('says there is room for more when it uses fewer pages than allowed', () => {
    const layout = layoutCv({ pageLimit: 2, sections: ifoodSections, profile, show: onePageShow })
    const fit = fitOf(layout, 2)

    expect(describeFit(fit).detail).toContain('so there is room for more')
  })
})

describe('shorterVersions', () => {
  function row(slug: string, key: string) {
    const block = find(slug)
    return { block: printBlock(block), current: printVersion(block.versions.find((v) => v.key === key)!), versions: block.versions.map(printVersion) }
  }

  it('ranks the shorter versions by how much they save, at most three', () => {
    const options = shorterVersions([row('attendance', 'att-base'), row('bi', 'bi-base'), row('rats', 'rats-base'), row('semcomp', 'sem-base')])

    expect(options.length).toBeGreaterThan(0)
    expect(options.length).toBeLessThanOrEqual(3)
    const saves = options.map((o) => o.save)
    expect(saves).toEqual([...saves].sort((a, b) => b - a))
    expect(options.every((o) => o.save >= METRICS.line * 0.9)).toBe(true)
  })

  it('picks, per block, the version that saves the most', () => {
    const [best] = shorterVersions([row('attendance', 'att-base')])

    expect(best.blockName).toBe('Attendance Control App')
    expect(best.version.id).toBe('att-jb') // the one-bullet version
  })

  it('suggests nothing for a block with a single version', () => {
    expect(shorterVersions([row('visio', 'visio-base')])).toEqual([])
  })
})

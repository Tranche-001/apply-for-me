// Projeto Vira Voto reaches fresh installs through seed-data.json and existing databases through a migration: both
// must carry the same approved title, bullets and dated notes entry.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import seed from '../../../prisma/seed-data.json'

const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261108200000_vira_voto_update/migration.sql'), 'utf8')
const block = seed.blocks.find((b) => b.slug === 'viravoto')
const experience = seed.experiences.find((e) => e.blockSlugs.includes('Projeto Vira Voto'))
const MARKER = 'Update of Nov 8, 2026, from the project repository and my own words'

describe('Projeto Vira Voto', () => {
  test('the block is an experience with one version, Director & Full-Stack, and the approved bullets', () => {
    expect(block).toMatchObject({ name: 'Projeto Vira Voto', section: 'EXPERIENCE' })
    const [version] = block!.versions
    expect(version).toMatchObject({ name: 'Director & Full-Stack', title: 'Director & Full-Stack Developer — Projeto Vira Voto' })
    expect(version.bullets.map((b) => b.text).join(' ')).toMatch(/100\+ volunteers into 34\+ groups that helped turn 1,000\+ votes/)
  })

  test('the migration adds the same title, stack and bullets', () => {
    const version = block!.versions[0]
    expect(sql).toContain(`'${version.title}'`)
    expect(sql).toContain(`'${block!.stack}'`)
    for (const b of version.bullets) expect(sql).toContain(`'${b.text}'`)
  })

  test('the notes keep his words and end with the dated entry the migration appends once', () => {
    const notes = experience!.notes
    expect(notes.startsWith('O Projeto Vira Voto Santa Felicia')).toBe(true)
    const entry = notes.slice(notes.indexOf(MARKER))
    for (const line of entry.split('\n').slice(1)) expect(sql).toContain(`'${line}'`)
    expect(sql).toContain(`'${MARKER}'`)
    expect(sql).toMatch(/strpos\(e\.notes, marker\) = 0/)
  })

  test('no contact details in the new data', () => {
    const text = JSON.stringify({ block, experience }) + sql
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|\+55|\(\d{2}\)\s?\d{4,5}-?\d{4}/i)
  })
})

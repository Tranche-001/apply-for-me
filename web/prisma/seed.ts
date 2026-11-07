// Seeds the database with the sample data from the approved design (your real CV text, word for word).
// Run with `npm run db:seed`. It replaces everything, so only use it on a fresh or test database.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient, type BulletKind, type LinkKind, type Section } from '@prisma/client'

type SeedData = {
  blocks: {
    slug: string; name: string; section: Section; org: string; location: string; dates: string; stack: string; position: number
    versions: { key: string; name: string; title: string; isBase: boolean; themes: string[]; jobs: string[]
      bullets: { kind: BulletKind; text: string; want: BulletKind | null }[] }[]
  }[]
  jobs: {
    company: string; role: string; label: string; links: { kind: LinkKind; url: string }[]
    cv: null | { pages: number; sectionOrder: Section[]; showEducation: boolean; showSkills: boolean; showAchievements: boolean; source: string
      items: { section: Section; position: number; blockSlug: string; versionKey: string }[] }
  }[]
  profile: {
    education: { degree: string; dates: string; school: string; location: string; position: number }[]
    skills: { label: string; text: string; position: number }[]
    achievements: { title: string; description: string; position: number }[]
  }
  questions: { key: string; position: number; short: string; full: string; looksFor: string[]; answer: string
    founderNotes: string; founderRefs: string[]; tailored: { jobLabel: string; text: string }[] }[]
  rules: { group: string; text: string; source: string; on: boolean; position: number }[]
  experiences: { title: string; where: string; when: string; notes: string; position: number; blockSlugs: string[] }[]
}

const data = JSON.parse(readFileSync(join(__dirname, 'seed-data.json'), 'utf8')) as SeedData
const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx) => {
    // Children first, so foreign keys never block the wipe.
    await tx.tailoredAnswer.deleteMany()
    await tx.cvItem.deleteMany()
    await tx.cv.deleteMany()
    await tx.versionJob.deleteMany()
    await tx.jobLink.deleteMany()
    await tx.job.deleteMany()
    await tx.bullet.deleteMany()
    await tx.version.deleteMany()
    await tx.block.deleteMany()
    await tx.experience.deleteMany()
    await tx.behavioralQuestion.deleteMany()
    await tx.educationEntry.deleteMany()
    await tx.skillLine.deleteMany()
    await tx.achievement.deleteMany()
    await tx.preferenceRule.deleteMany()

    const jobIdByLabel = new Map<string, string>()
    for (const j of data.jobs) {
      const job = await tx.job.create({
        data: { company: j.company, role: j.role, links: { create: j.links.map((l, i) => ({ kind: l.kind, url: l.url, position: i })) } },
      })
      jobIdByLabel.set(j.label, job.id)
    }

    const versionId = new Map<string, string>() // "<blockSlug>/<versionKey>" -> id
    const blockIdByName = new Map<string, string>()
    for (const b of data.blocks) {
      const block = await tx.block.create({
        data: { slug: b.slug, name: b.name, section: b.section, org: b.org, location: b.location, dates: b.dates, stack: b.stack, position: b.position },
      })
      blockIdByName.set(b.name, block.id)
      for (const [vi, v] of b.versions.entries()) {
        const version = await tx.version.create({
          data: {
            blockId: block.id, name: v.name, title: v.title, isBase: v.isBase, themes: v.themes, position: vi,
            bullets: { create: v.bullets.map((x, i) => ({ kind: x.kind, text: x.text, want: x.want, position: i })) },
            jobs: { create: v.jobs.filter((label) => jobIdByLabel.has(label)).map((label) => ({ jobId: jobIdByLabel.get(label)! })) },
          },
        })
        versionId.set(`${b.slug}/${v.key}`, version.id)
      }
    }

    for (const j of data.jobs) {
      if (!j.cv) continue
      await tx.cv.create({
        data: {
          jobId: jobIdByLabel.get(j.label)!, pages: j.cv.pages, sectionOrder: j.cv.sectionOrder, showEducation: j.cv.showEducation,
          showSkills: j.cv.showSkills, showAchievements: j.cv.showAchievements, source: j.cv.source,
          items: {
            create: j.cv.items.map((it) => {
              const id = versionId.get(`${it.blockSlug}/${it.versionKey}`)
              if (!id) throw new Error(`CV for ${j.label} points at a missing version ${it.blockSlug}/${it.versionKey}`)
              return { versionId: id, section: it.section, position: it.position }
            }),
          },
        },
      })
    }

    for (const e of data.experiences) {
      const exp = await tx.experience.create({ data: { title: e.title, where: e.where, when: e.when, notes: e.notes, position: e.position } })
      const ids = e.blockSlugs.map((name) => blockIdByName.get(name)).filter((id): id is string => !!id)
      if (ids.length) await tx.block.updateMany({ where: { id: { in: ids } }, data: { experienceId: exp.id } })
    }

    for (const q of data.questions) {
      await tx.behavioralQuestion.create({
        data: {
          key: q.key, position: q.position, short: q.short, full: q.full, looksFor: q.looksFor, answer: q.answer,
          founderNotes: q.founderNotes, founderRefs: q.founderRefs, references: [],
          tailored: { create: q.tailored.filter((t) => jobIdByLabel.has(t.jobLabel)).map((t) => ({ jobId: jobIdByLabel.get(t.jobLabel)!, text: t.text })) },
        },
      })
    }

    await tx.educationEntry.createMany({ data: data.profile.education })
    await tx.skillLine.createMany({ data: data.profile.skills })
    await tx.achievement.createMany({ data: data.profile.achievements })
    await tx.preferenceRule.createMany({ data: data.rules })
  }, { timeout: 60_000 })

  const counts = await Promise.all([prisma.block.count(), prisma.version.count(), prisma.job.count(), prisma.cv.count(), prisma.behavioralQuestion.count()])
  console.log(`Seeded ${counts[0]} blocks, ${counts[1]} versions, ${counts[2]} jobs, ${counts[3]} CVs, ${counts[4]} questions.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

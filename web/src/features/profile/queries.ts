import 'server-only'
import { db } from '@/lib/db'
import type { ProfileData } from './types'

/** Education, Technical Skills and Leadership & Achievements, in print order. */
export async function getProfile(): Promise<ProfileData> {
  const [education, skills, achievements] = await Promise.all([
    db.educationEntry.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    db.skillLine.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    db.achievement.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
  ])
  return {
    education: education.map((x) => ({ id: x.id, degree: x.degree, dates: x.dates, school: x.school, location: x.location })),
    skills: skills.map((x) => ({ id: x.id, label: x.label, text: x.text })),
    achievements: achievements.map((x) => ({ id: x.id, title: x.title, description: x.description })),
  }
}

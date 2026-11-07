export type EducationItem = { id: string; degree: string; dates: string; school: string; location: string }
export type SkillItem = { id: string; label: string; text: string }
export type AchievementItem = { id: string; title: string; description: string }

/** Education, Technical Skills and Leadership & Achievements: the parts of the CV that aren't blocks. */
export type ProfileData = {
  education: EducationItem[]
  skills: SkillItem[]
  achievements: AchievementItem[]
}

export type ProfileKind = 'education' | 'skills' | 'achievements'

export type ProfileItemOf<K extends ProfileKind> = ProfileData[K][number]

/** Editable text fields of each kind (everything but the id). */
export const PROFILE_FIELDS = {
  education: ['degree', 'dates', 'school', 'location'],
  skills: ['label', 'text'],
  achievements: ['title', 'description'],
} as const

export const PROFILE_HEADINGS: Record<ProfileKind, string> = {
  education: 'Education',
  skills: 'Technical Skills',
  achievements: 'Leadership & Achievements',
}

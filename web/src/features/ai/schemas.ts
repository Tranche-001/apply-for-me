// What the model must return, as Zod schemas. They become the JSON schema of the structured output
// and validate the answer again on our side; anything that doesn't match is rejected, never guessed at.
// Keep them inside the structured-output subset: objects, arrays, enums, strings, booleans, nullable.
import { z } from 'zod'
import { BULLET_KINDS, SECTIONS } from './context-types'

const section = z.enum(SECTIONS)
const bulletKind = z.enum(BULLET_KINDS)
const reportTag = z.enum(['NEW', 'REUSED', 'ORDER', 'ADDED', 'LEFT OUT', 'NOTE'])

export const reportLineSchema = z.object({
  tag: reportTag,
  text: z.string().describe('One short sentence in English.'),
})

export const draftBulletSchema = z.object({
  kind: bulletKind.describe('MISSING marks a gap you could not fill from the facts given.'),
  text: z.string().describe('The bullet text. Empty when kind is MISSING.'),
  want: bulletKind.nullable().describe('For a MISSING bullet: which kind is missing. Otherwise null.'),
})

export const newBlockSchema = z.object({
  name: z.string(),
  section,
  org: z.string(),
  location: z.string(),
  dates: z.string(),
  stack: z.string(),
})

export const cvPlanOutputSchema = z.object({
  sectionOrder: z.array(section),
  showEducation: z.boolean(),
  showSkills: z.boolean(),
  showAchievements: z.boolean(),
  items: z
    .array(z.object({ versionId: z.string(), section }))
    .describe('Chosen versions in print order within each section. Only ids from the library.'),
  report: z.array(reportLineSchema),
  asks: z.array(z.string()).describe('Questions for the user about facts the library is missing. At most 3.'),
})
export type CvPlanOutput = z.infer<typeof cvPlanOutputSchema>

export const requirementMatchSchema = z.object({
  requirementId: z.string().describe('Id of the requirement (r1, r2...) these words show.'),
  phrases: z.array(z.string()).describe('Short phrases copied exactly, word for word, from the bullets of this block or version.'),
  partly: z.boolean().describe('true when the words only partly show the requirement.'),
})

export const analysisOutputSchema = z.object({
  requirements: z.array(
    z.object({
      id: z.string().describe('"r1", "r2", and so on, in order.'),
      text: z.string().describe('A requirement of the job, in a few words.'),
      status: z.enum(['covered', 'partial', 'missing']),
      evidence: z.string().describe('Which blocks or versions show it, or what is missing.'),
      quotes: z.array(z.string()).describe('1 to 3 sentences of the posting that state this requirement, copied word for word.'),
      keys: z.array(z.string()).describe('Short pieces of those quotes, copied exactly, that carry the requirement (to highlight).'),
    }),
  ),
  asks: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      experienceId: z.string().nullable().describe('Id of the <experience> this question is about (where he would have done it), or null when none fits.'),
      requirementId: z.string().nullable().describe('Id of the requirement this question is about, or null.'),
    }),
  ),
  drafts: z.array(
    z.object({
      blockId: z.string().nullable().describe('Existing block for a new version; null for a new block.'),
      newBlock: newBlockSchema.nullable().describe('Only for a new block; null otherwise.'),
      fromVersionId: z.string().nullable().describe('Id of the version of that block this draft starts from, or null.'),
      title: z.string(),
      bullets: z.array(draftBulletSchema),
      improvedBy: z.string().nullable().describe('Id of the question whose answer can fill this draft\'s MISSING bullet, or null.'),
      matches: z.array(requirementMatchSchema).describe('The requirements this draft shows, with the words that show them.'),
      note: z.string().describe('One sentence: what this draft changes compared with the existing versions, and why.'),
    }),
  ),
  reused: z.array(z.object({ versionId: z.string(), why: z.string(), matches: z.array(requirementMatchSchema) })),
  leftOut: z
    .array(z.object({ versionId: z.string(), why: z.string().describe('One sentence: why this version is not used for this job.'), matches: z.array(requirementMatchSchema) }))
    .describe('Relevant library versions you did not use, with why.'),
  report: z.array(reportLineSchema),
})
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>

export const answerOutputSchema = z.object({
  text: z.string().describe('The answer, in Brazilian Portuguese.'),
  changes: z.array(z.string()).describe('2 to 4 short English labels saying what this draft did.'),
})
export type AnswerOutput = z.infer<typeof answerOutputSchema>

export const blockDraftOutputSchema = z.object({
  blockId: z.string().nullable(),
  newBlock: newBlockSchema.nullable(),
  name: z.string().describe('Short name for the version, e.g. "AI focus". "Base" for a new block.'),
  title: z.string(),
  bullets: z.array(draftBulletSchema),
})
export type BlockDraftOutput = z.infer<typeof blockDraftOutputSchema>

export const jobInfoOutputSchema = z.object({
  company: z.string().describe('The hiring company, as the posting names it. Empty when the posting does not say.'),
  role: z.string().describe('The job title, as the posting names it. Empty when the posting does not say.'),
})
export type JobInfoOutput = z.infer<typeof jobInfoOutputSchema>

export const placementOutputSchema = z.object({
  placements: z.array(
    z.object({
      askId: z.string().describe('The id of the question, exactly as given.'),
      experienceId: z.string().nullable().describe('Id of the experience this answer belongs to, or null when it names a place that is not in the list.'),
      alsoFits: z.array(z.string()).describe('At most 2 other experience ids where this answer could also go. Never the main one.'),
      why: z.string().describe('One short sentence, in English, saying why it goes there. Name experiences by their titles, never by id.'),
      newExperienceName: z.string().nullable().describe('Only when the answer names a place that is not an experience yet: that place\'s name, as he wrote it. Otherwise null.'),
    }),
  ),
})
export type PlacementOutput = z.infer<typeof placementOutputSchema>

/** Parses the model's text as JSON for `schema`; returns null when it is not valid. */
export function parseModelJson<T>(schema: z.ZodType<T>, text: string): T | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

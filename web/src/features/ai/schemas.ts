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

export const analysisOutputSchema = z.object({
  requirements: z.array(
    z.object({
      text: z.string().describe('A requirement of the job, in a few words.'),
      status: z.enum(['covered', 'partial', 'missing']),
      evidence: z.string().describe('Which blocks or versions show it, or what is missing.'),
    }),
  ),
  asks: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      experienceId: z.string().nullable().describe('Id of the <experience> this question is about (where he would have done it), or null when none fits.'),
    }),
  ),
  drafts: z.array(
    z.object({
      blockId: z.string().nullable().describe('Existing block for a new version; null for a new block.'),
      newBlock: newBlockSchema.nullable().describe('Only for a new block; null otherwise.'),
      title: z.string(),
      bullets: z.array(draftBulletSchema),
      waitingOn: z.string().nullable().describe('Id of the unanswered question this draft depends on, or null.'),
      note: z.string().describe('One sentence: what this draft changes compared with the existing versions, and why.'),
    }),
  ),
  reused: z.array(z.object({ versionId: z.string(), why: z.string() })),
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

// One AI call: a block drafted from an experience's notes (a new version when a block is linked, else a new block).
// Shared by Experiences → "Draft a block from this" and the pairing pass. Writes nothing.
import type { AiRunner } from './client'
import type { ExperienceContext, LibraryBlock } from './context-types'
import { TASKS } from './model'
import { finalizeBlockDraft } from './postprocess'
import { buildBlockDraftPrompt } from './prompts'
import { blockDraftOutputSchema } from './schemas'
import type { DraftVersion } from './types'

export async function draftBlockWith(ai: AiRunner, experience: ExperienceContext, library: LibraryBlock[], rules: string[]): Promise<DraftVersion> {
  const linkedBlocks = library.filter((b) => experience.blockIds.includes(b.id))
  const otherBlockNames = library.filter((b) => !experience.blockIds.includes(b.id)).map((b) => b.name)
  const prompt = buildBlockDraftPrompt({ experience, linkedBlocks, otherBlockNames, rules })
  const raw = await ai.run(prompt, blockDraftOutputSchema, TASKS.blockDraft)
  return finalizeBlockDraft(raw, library, experience)
}

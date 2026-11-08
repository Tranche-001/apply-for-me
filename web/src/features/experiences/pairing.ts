import 'server-only'
// Every experience gets a block and every block an experience. An experience with notes and no block: the AI drafts
// its block from the notes and it is saved as the Base version, linked to the experience. A block with no experience:
// an experience is made from the block's own text (no AI). Run by Experiences → "Make them" and, quietly, as the first
// step of Job analysis → Analyze. An experience with nothing written is left alone (the AI only uses what is written).
import { db } from '@/lib/db'
import type { AiRunner } from '../ai/client'
import { draftBlockWith } from '../ai/block-draft'
import { loadExperiences, loadLibrary, loadRules } from '../ai/context'
import { draftVersionInput } from '../ai/draft-schema'
import { errorLogContext } from '../ai/errors'
import { saveDraftToLibrary } from '../ai/library-writes'
import { experienceFromBlock, hasWork, planPairing, type PairingNeeds, type PairingPlan, type PairingResult } from './pairing-plan'

export type { PairingNeeds, PairingResult } from './pairing-plan'

const TX_OPTIONS = { timeout: 30_000, maxWait: 5_000 } as const
const titleOf = (title: string) => title.trim() || 'Untitled experience'

/** Another run (a second tab, Analyze while "Make them" runs) already paired it: not an error, nothing to do. */
class AlreadyPaired extends Error {}

async function readPlan(): Promise<PairingPlan> {
  const [experiences, blocks] = await Promise.all([
    db.experience.findMany({ orderBy: { position: 'asc' }, select: { id: true, title: true, notes: true, blocks: { select: { id: true } } } }),
    db.block.findMany({ orderBy: [{ section: 'asc' }, { position: 'asc' }], select: { id: true, name: true, experienceId: true } }),
  ])
  return planPairing(
    experiences.map((e) => ({ id: e.id, title: e.title, notes: e.notes, blockIds: e.blocks.map((b) => b.id) })),
    blocks,
  )
}

export async function readPairingNeeds(): Promise<PairingNeeds> {
  const plan = await readPlan()
  return {
    needBlock: plan.needBlock.map((e) => titleOf(e.title)),
    needNotes: plan.needNotes.map((e) => titleOf(e.title)),
    // A block about to be linked still has no experience today.
    needExperience: [...plan.link.map((l) => l.block.name), ...plan.needExperience.map((b) => b.name)],
  }
}

/** Links a block with no experience to the blockless experience of the same name. Returns the block's name. */
async function linkPair(blockId: string, experienceId: string, name: string): Promise<string> {
  return db.$transaction(async (tx) => {
    if ((await tx.block.count({ where: { experienceId } })) > 0) throw new AlreadyPaired()
    const linked = await tx.block.updateMany({ where: { id: blockId, experienceId: null }, data: { experienceId } })
    if (linked.count === 0) throw new AlreadyPaired()
    return name
  }, TX_OPTIONS)
}

/** The experience for one block with none, linked to it in the same transaction. Returns its title. */
async function makeExperience(blockId: string): Promise<string> {
  return db.$transaction(async (tx) => {
    const block = await tx.block.findUnique({
      where: { id: blockId },
      select: {
        name: true,
        org: true,
        location: true,
        dates: true,
        stack: true,
        experienceId: true,
        versions: { orderBy: [{ isBase: 'desc' }, { position: 'asc' }], take: 1, select: { title: true, bullets: { orderBy: { position: 'asc' }, select: { kind: true, text: true } } } },
      },
    })
    if (!block || block.experienceId) throw new AlreadyPaired()
    const draft = experienceFromBlock({ ...block, base: block.versions[0] ?? null })
    const last = await tx.experience.findFirst({ orderBy: { position: 'desc' }, select: { position: true } })
    const made = await tx.experience.create({ data: { ...draft, position: (last?.position ?? -1) + 1 } })
    const linked = await tx.block.updateMany({ where: { id: blockId, experienceId: null }, data: { experienceId: made.id } })
    if (linked.count === 0) throw new AlreadyPaired()
    return draft.title
  }, TX_OPTIONS)
}

/** The AI drafts the block for one experience from its notes; saved as the Base version of a new linked block. */
async function makeBlock(ai: AiRunner, experienceId: string, rules: string[]): Promise<string> {
  const [experiences, library] = await Promise.all([loadExperiences(), loadLibrary()])
  const experience = experiences.find((e) => e.id === experienceId)
  if (!experience || experience.blockIds.length > 0 || !experience.notes.trim()) throw new AlreadyPaired()
  const draft = draftVersionInput.parse(await draftBlockWith(ai, experience, library, rules))
  if (!draft.newBlock) throw new Error('the draft is not a new block')
  return db.$transaction(async (tx) => {
    // The AI call takes seconds: check again that no block was linked meanwhile.
    if ((await tx.block.count({ where: { experienceId } })) > 0) throw new AlreadyPaired()
    const saved = await saveDraftToLibrary(tx, draft, { experienceId })
    return saved.blockName
  }, TX_OPTIONS)
}

/** Runs one step; an AlreadyPaired step is skipped, any other failure is logged and its name returned. */
async function step(what: string, name: string, work: () => Promise<string>): Promise<{ made: string | null; failed: string | null }> {
  try {
    return { made: await work(), failed: null }
  } catch (err) {
    if (err instanceof AlreadyPaired) return { made: null, failed: null }
    console.error(`[pairing] ${what} failed`, errorLogContext(err))
    return { made: null, failed: name }
  }
}

/**
 * Makes what is missing. Blocks first get their experiences (no AI), then each experience with notes gets its block,
 * one AI call at a time. Never throws: what could not be made is listed in `failed`.
 */
export async function pairLibrary(ai: AiRunner | null): Promise<PairingResult> {
  const plan = await readPlan()
  const result: PairingResult = { linked: [], blocksMade: [], experiencesMade: [], needNotes: plan.needNotes.map((e) => titleOf(e.title)), waitingForAi: [], failed: [] }
  if (!hasWork(plan)) return result

  for (const { block, experience } of plan.link) {
    const r = await step('linkPair', block.name, () => linkPair(block.id, experience.id, block.name))
    if (r.made) result.linked.push(r.made)
    if (r.failed) result.failed.push(r.failed)
  }

  for (const block of plan.needExperience) {
    const r = await step('makeExperience', block.name, () => makeExperience(block.id))
    if (r.made) result.experiencesMade.push(r.made)
    if (r.failed) result.failed.push(r.failed)
  }

  if (!ai) return { ...result, waitingForAi: plan.needBlock.map((e) => titleOf(e.title)) }
  const rules = plan.needBlock.length ? await loadRules('cv') : []
  for (const experience of plan.needBlock) {
    const r = await step('makeBlock', titleOf(experience.title), () => makeBlock(ai, experience.id, rules))
    if (r.made) result.blocksMade.push(r.made)
    if (r.failed) result.failed.push(r.failed)
  }
  return result
}

/** The quiet run at the start of Job analysis: never fails the analysis, only logs. */
export async function pairLibraryQuietly(ai: AiRunner | null): Promise<void> {
  try {
    await pairLibrary(ai)
  } catch (err) {
    console.error('[pairing] quiet run failed', errorLogContext(err))
  }
}

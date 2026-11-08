// Which experiences have no block and which blocks have no experience, and the experience a block makes.
// Pure: no database, no AI. The writes live in pairing.ts.

export type PairingExperience = { id: string; title: string; notes: string; blockIds: readonly string[] }
export type PairingBlock = { id: string; name: string; experienceId: string | null }

export type PairingPlan = {
  /** Experiences with notes and no block: the AI drafts a block from the notes. */
  needBlock: PairingExperience[]
  /** Experiences with no block and nothing written: nothing to draft from (P1), so they wait for notes. */
  needNotes: PairingExperience[]
  /** Blocks linked to no experience: an experience is made from the block's own text. */
  needExperience: PairingBlock[]
  /** A block with no experience and a blockless experience of the same name: they are linked, nothing is made (P3). */
  link: { block: PairingBlock; experience: PairingExperience }[]
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function planPairing(experiences: readonly PairingExperience[], blocks: readonly PairingBlock[]): PairingPlan {
  const blockless = experiences.filter((e) => e.blockIds.length === 0)
  const link: PairingPlan['link'] = []
  for (const block of blocks.filter((b) => !b.experienceId)) {
    const experience = blockless.find((e) => e.title.trim() && sameName(e.title, block.name) && !link.some((l) => l.experience.id === e.id))
    if (experience) link.push({ block, experience })
  }
  const linkedBlocks = new Set(link.map((l) => l.block.id))
  const linkedExperiences = new Set(link.map((l) => l.experience.id))
  const stillBlockless = blockless.filter((e) => !linkedExperiences.has(e.id))
  return {
    needBlock: stillBlockless.filter((e) => e.notes.trim()),
    needNotes: stillBlockless.filter((e) => !e.notes.trim()),
    needExperience: blocks.filter((b) => !b.experienceId && !linkedBlocks.has(b.id)),
    link,
  }
}

/** True when there is something the app can do now (an experience waiting for notes is not). */
export const hasWork = (plan: PairingPlan): boolean => plan.needBlock.length > 0 || plan.needExperience.length > 0 || plan.link.length > 0

/** What the Experiences screen shows: names only. */
export type PairingNeeds = { needBlock: string[]; needNotes: string[]; needExperience: string[] }

/** What a run made, and what it could not. */
export type PairingResult = {
  /** Blocks linked to the experience of the same name (nothing made). */
  linked: string[]
  blocksMade: string[]
  experiencesMade: string[]
  /** Experiences with nothing written: write about them first. */
  needNotes: string[]
  /** Experiences that still need a block because the AI is not set up. */
  waitingForAi: string[]
  /** Names whose block or experience could not be made (the reason is logged on the server). */
  failed: string[]
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const names = (list: readonly string[]) => list.join(', ')

/** The banner's sentence, e.g. "2 experiences have no block: A, B. 1 block has no experience: C." Empty when none. */
export function pairingSummary(needs: PairingNeeds): string {
  return [
    needs.needBlock.length ? `${count(needs.needBlock.length, 'experience has', 'experiences have')} no block: ${names(needs.needBlock)}.` : '',
    needs.needExperience.length ? `${count(needs.needExperience.length, 'block has', 'blocks have')} no experience: ${names(needs.needExperience)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/** After "Make them": what was made and what was not, in words (H1). */
export function pairingDoneMessage(r: PairingResult): string {
  const made = [
    r.blocksMade.length ? `${count(r.blocksMade.length, 'block', 'blocks')} (${names(r.blocksMade)})` : '',
    r.experiencesMade.length ? `${count(r.experiencesMade.length, 'experience', 'experiences')} (${names(r.experiencesMade)})` : '',
  ].filter(Boolean)
  const linked = r.linked.length ? `Linked ${names(r.linked)} to the experience of the same name.` : ''
  return [
    made.length ? `Made ${made.join(' and ')}. Edit them in Blocks and here.` : linked ? '' : 'Nothing new was made.',
    linked,
    r.failed.length ? `Couldn’t make: ${names(r.failed)}. Try again.` : '',
    r.waitingForAi.length ? `The AI key is missing, so ${names(r.waitingForAi)} still ${r.waitingForAi.length === 1 ? 'has' : 'have'} no block.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export type BlockForExperience = {
  name: string
  org: string
  location: string
  dates: string
  stack: string
  /** The Base version (or the first one): its title and printed bullets. */
  base: { title: string; bullets: readonly { kind: string; text: string }[] } | null
}

export type ExperienceDraft = { title: string; where: string; when: string; notes: string }

/** The experience a block without one gets: its own fields and text, word for word (nothing is invented). */
export function experienceFromBlock(block: BlockForExperience): ExperienceDraft {
  const lines = [
    block.base?.title.trim() ? `Title on my CV: ${block.base.title.trim()}` : '',
    ...(block.base?.bullets ?? []).filter((b) => b.kind !== 'MISSING' && b.text.trim()).map((b) => `- ${b.text.trim()}`),
    block.stack.trim() ? `Stack: ${block.stack.trim()}` : '',
  ].filter(Boolean)
  return {
    title: block.name.trim(),
    where: [block.org, block.location].map((s) => s.trim()).filter(Boolean).join(' · '),
    when: block.dates.trim(),
    notes: lines.length ? `From the block “${block.name.trim()}”:\n${lines.join('\n')}` : '',
  }
}

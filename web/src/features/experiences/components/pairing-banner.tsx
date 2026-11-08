'use client'

// One line above Experiences when an experience has no block or a block has no experience, with "Make them".
// Shown only while there is something to make; after a run it says what was made (H1) and stays out of the way.
import Link from 'next/link'
import { pairingSummary, type PairingNeeds } from '../pairing-plan'

type Props = {
  needs: PairingNeeds
  aiReady: boolean
  running: boolean
  /** What the last run made or could not, in words; null before any run. */
  done: string | null
  error: string | null
  onMake: () => void
}

export function PairingBanner({ needs, aiReady, running, done, error, onMake }: Props) {
  const summary = pairingSummary(needs)
  if (!summary && !done && !error) return null
  // Without the AI only blocks can get experiences; experiences need the AI to draft their block.
  const canMake = needs.needExperience.length > 0 || (aiReady && needs.needBlock.length > 0)
  return (
    <section
      aria-label="Experiences and blocks"
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] border border-[var(--amber-line)] bg-[var(--amber-soft)] px-3 py-2 text-[12.5px] leading-[1.45] text-[var(--amber-ink)]"
    >
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-0.5">
        {summary && (
          <p className="m-0">
            {summary} Every experience gets a block for your CVs, and every block an experience the AI can read.
            {needs.needBlock.length > 0 && !aiReady && ' The AI key is missing, so blocks can’t be drafted yet.'}
          </p>
        )}
        {running && (
          <p role="status" className="m-0 font-medium">
            Making them… the AI drafts each block from what you wrote, one at a time.
          </p>
        )}
        {!running && done && (
          <p role="status" className="m-0 font-medium">
            {done} <Link href="/blocks">Open Blocks</Link>
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 font-medium">
            {error}
          </p>
        )}
      </div>
      {summary && (
        <button type="button" className="btn-p" onClick={onMake} disabled={running || !canMake}>
          {running ? 'Making…' : 'Make them'}
        </button>
      )}
    </section>
  )
}

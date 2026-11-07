// A requirement the CV meets (the prototype's metPopover, option B): what the posting says, word for word,
// next to the CV blocks that show it with their words highlighted (P1, H6).
import type { DraftBullet, JobRequirement } from '../../ai/types'
import { cvShowsLabel } from '../review-labels'
import { c } from './ui/cx'
import { HitCard, type BlockTagKind } from './ui/hit-card'
import { Modal } from './ui/modal'
import { PostingQuotes } from './ui/posting-quotes'

/**
 * A block of this CV that shows the requirement. Like the prototype's hit cards, a project block (one with a
 * stack) shows its title only; an experience block shows its dates.
 */
export type MetHit = {
  id: string
  tag: BlockTagKind
  blockName: string
  title: string
  dates?: string
  stack?: string
  bullets: DraftBullet[]
  /** The block's words that show it (yellow). */
  phrases: string[]
  /** Shows "Edit block"; false for a block that is not in this CV. */
  editable: boolean
}

export type Props = {
  requirement: JobRequirement
  /** The saved posting, split with postingLines(). */
  postingLines: string[]
  hits: MetHit[]
  /** Opened from a block's popover: "← Back to <block>". */
  backTo: string | null
  onBack?: () => void
  onOpenPosting: () => void
  onEditBlock: (id: string) => void
  onClose: () => void
}

export function MetPopover({ requirement, postingLines, hits, backTo, onBack, onOpenPosting, onEditBlock, onClose }: Props) {
  return (
    <Modal label={requirement.text} onClose={onClose}>
      <div className={c('a-pop src-b')}>
        <div className={c('req-h')}>
          <span className={c('a-met')}>MET</span>
          <h3>{requirement.text}</h3>
          <button className={c('x')} type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={c('src-cols')}>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>The posting says</span>
            <PostingQuotes quotes={requirement.quotes} keys={requirement.keys} lines={postingLines} context />
            <button className={c('a-link2')} type="button" onClick={onOpenPosting}>
              See it in the full posting
            </button>
          </div>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>{cvShowsLabel(hits.length)}</span>
            {hits.map((h) => (
              <HitCard
                key={h.id}
                tag={h.tag}
                blockName={h.blockName}
                title={h.title}
                dates={h.stack ? undefined : h.dates}
                bullets={h.bullets}
                phrases={h.phrases}
                onEdit={h.editable ? () => onEditBlock(h.id) : undefined}
              />
            ))}
          </div>
        </div>
        <div className={c('foot')}>
          {backTo && onBack ? (
            <button className={c('a-btn')} type="button" onClick={onBack}>
              ← Back to {backTo}
            </button>
          ) : null}
          <span className={c('sp')} />
          <button className={c('a-btn')} type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

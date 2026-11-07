// A block for this CV, written out in full (the prototype's draftCard): a new version or block with Keep,
// Edit and Discard, or one used as it is with Edit and "Leave out of this CV" (P2, P3).
import type { DraftBullet } from '../../ai/types'
import { bulletTag, gapHint, type CardKind } from '../review-labels'
import { c } from './ui/cx'
import { MatchChip, type ChipItem } from './ui/match-chip'

const PEN = 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'
const CROSS = ['M18 6 6 18', 'm6 6 12 12']

export type Props = {
  kind: CardKind
  blockName: string
  /** The version used, for a block AS IS ("version “Base”"). */
  versionName?: string
  title: string
  bullets: DraftBullet[]
  /** "Q1 can improve it": the question whose answer can fill this draft's gap. */
  improves?: string | null
  /** What the draft changed (new drafts only, like the prototype). */
  why?: string | null
  chipItems: ChipItem[]
  chipEmptyText: string
  keep?: boolean
  onKeep?: (keep: boolean) => void
  onEdit: () => void
  /** Discard (new) or leave out of this CV (as is). */
  onRemove: () => void
}

function Head({ kind, blockName, versionName }: Pick<Props, 'kind' | 'blockName' | 'versionName'>) {
  if (kind === 'as-is') {
    return (
      <>
        <span className={c('a-asis')}>AS IS</span>
        {versionName ? `${blockName} · version “${versionName}”` : blockName}
      </>
    )
  }
  return (
    <>
      <span className={c('a-new')}>{kind === 'new-block' ? 'NEW BLOCK' : 'NEW VERSION'}</span>
      {kind === 'new-version' ? `of ${blockName}` : null}
    </>
  )
}

function Bullets({ bullets }: { bullets: readonly DraftBullet[] }) {
  return (
    <ul>
      {bullets.map((b, i) => {
        const tag = bulletTag(b)
        return (
          <li key={i}>
            <span className={c('a-kind', tag.tone)}>{tag.label}</span>
            {b.kind === 'MISSING' ? <span className={c('a-gap')}>{gapHint(b)}</span> : <span>{b.text}</span>}
          </li>
        )
      })}
    </ul>
  )
}

export function DraftCard({ kind, blockName, versionName, title, bullets, improves, why, chipItems, chipEmptyText, keep = true, onKeep, onEdit, onRemove }: Props) {
  const asIs = kind === 'as-is'
  const removeTitle = asIs ? 'Leave out of this CV' : 'Discard'
  return (
    <div className={c('a-draft', asIs && 'asis')}>
      <div className={c('top')}>
        <Head kind={kind} blockName={blockName} versionName={versionName} />
        <span className={c('sp')} />
        {!asIs && (
          <label className={c('a-keep', !keep && 'off')}>
            <input type="checkbox" className="sr-only" checked={keep} onChange={(ev) => onKeep?.(ev.target.checked)} aria-label={`Keep ${blockName}`} />
            <i aria-hidden="true">✓</i>Keep
          </label>
        )}
        <button className={c('a-icon pen')} type="button" onClick={onEdit} aria-label={`Edit ${blockName}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={PEN} />
          </svg>
        </button>
        <button className={c('a-icon')} type="button" onClick={onRemove} title={removeTitle} aria-label={asIs ? `Leave ${blockName} out of this CV` : `Discard ${blockName}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {CROSS.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </button>
      </div>
      {improves ? (
        <div>
          <span className={c('a-improve')}>{improves}</span>
        </div>
      ) : null}
      <h4>{title}</h4>
      <Bullets bullets={bullets} />
      {!asIs && why ? <p className={c('why')}>{why}</p> : null}
      <div className={c('bottom')}>
        <MatchChip items={chipItems} emptyText={chipEmptyText} />
      </div>
    </div>
  )
}

import { matchChipLabel } from '../../review-labels'
import { c } from './cx'

/** One requirement a block helps match, and how (the block's own words). */
export type ChipItem = { name: string; how: string; partly: boolean }

/** "✓ 2 requirements · 1 partly" on a block; hover or focus shows which requirements of the job it matches (H6). */
export function MatchChip({ items, emptyText }: { items: ChipItem[]; emptyText: string }) {
  if (!items.length) {
    return (
      <span className={c('a-match none')} tabIndex={0}>
        No requirement
        <span className={c('a-tip')} role="tooltip">
          {emptyText}
        </span>
      </span>
    )
  }
  const { lead, partly } = matchChipLabel(items)
  return (
    <span className={c('a-match')} tabIndex={0}>
      {lead}
      {partly && <span className={c('pt')}>{partly}</span>}
      <span className={c('a-tip')} role="tooltip">
        <b>Helps match</b>
        <ul>
          {items.map((it) => (
            <li key={it.name}>
              <span className={c('st', it.partly && 'part')}>{it.partly ? '–' : '✓'}</span>
              <span>
                {it.name}
                <small>{it.how}</small>
              </span>
            </li>
          ))}
        </ul>
      </span>
    </span>
  )
}

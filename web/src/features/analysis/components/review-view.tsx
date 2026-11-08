// "Review & save" (the prototype's review(saved)): on the left "This CV", the requirements it meets and the
// blocks it uses, all clickable (H6); in the middle the real CV, new versions tagged NEW, double-click or
// Enter edits a block (H7).
import { Fragment, type ReactNode } from 'react'
import { CvPreview, type EntryUi } from '@/features/cv/components/cv-preview'
import type { CvLayout, LayoutEntry } from '@/features/cv/layout'
import type { Printed } from '@/features/cv/print'
import type { ProfileData } from '@/features/profile/types'
import { metCountLine, type ReviewGroup } from '../review-labels'
import { c } from './ui/cx'

const BLOCKS_ICON = [
  'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z',
  'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65',
  'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65',
]

const GROUPS: [ReviewGroup, string][] = [
  ['new', 'New for this job'],
  ['asis', 'As is'],
  ['out', 'Left out'],
]

/** A requirement the CV meets; `blocks` names the blocks that show it, from metBlocksLine(). */
export type ReviewMet = { id: string; name: string; blocks: string; partly?: boolean }
export type ReviewNotMet = { id: string; name: string }
/** A block in the list: `tag` from reviewBlockTag(), `sub` from reviewBlockSub(); `matched` = meets something in this CV. */
export type ReviewBlock = { group: ReviewGroup; id: string; name: string; tag: string | null; sub: string; matched: boolean }

export type Props = {
  met: ReviewMet[]
  notMet: ReviewNotMet[]
  /** Every requirement of the job (met + not met). */
  total: number
  blocks: ReviewBlock[]
  layout: CvLayout
  profile: ProfileData
  labels: Printed['labels']
  /** Block ids (LayoutEntry.block.id) of the new versions and new blocks: tagged NEW on the page. */
  newBlockIds: string[]
  /** Block ids whose role title is not the one you had: highlighted on the page (not on paper). */
  retitledBlockIds: string[]
  /** "Role titles for this job", above the CV. */
  titles: ReactNode
  pages: 1 | 2
  saved: boolean
  busy: boolean
  /** "Save 3 versions and the CV", from saveLabel(). */
  saveLabel: string
  onPages: (pages: 1 | 2) => void
  onBack: () => void
  onSave: () => void
  onOpenCompose: () => void
  onOpenRequirement: (id: string) => void
  onOpenBlock: (id: string) => void
  onEditBlock: (blockId: string) => void
}

function Requirements({ met, notMet, total, onOpenRequirement }: Pick<Props, 'met' | 'notMet' | 'total' | 'onOpenRequirement'>) {
  return (
    <>
      <h4>
        Requirements <span className={c('ct')}>{metCountLine(met.length, total)}</span>
      </h4>
      {met.length > 0 && (
        <>
          <p className={c('a-reqs-sub')}>Met</p>
          <ul className={c('a-reqs')}>
            {met.map((r) => (
              <li key={r.id}>
                <button className={c('a-req-btn')} type="button" onClick={() => onOpenRequirement(r.id)}>
                  <span className={c('ic', r.partly ? 'part' : 'met')}>{r.partly ? '–' : '✓'}</span>
                  <span>
                    {r.name}
                    <small>{r.blocks}</small>
                  </span>
                  <span className={c('chev')}>›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {notMet.length > 0 && (
        <>
          <p className={c('a-reqs-sub')}>Not met</p>
          <ul className={c('a-reqs')}>
            {notMet.map((r) => (
              <li key={r.id}>
                <button className={c('a-req-btn not')} type="button" onClick={() => onOpenRequirement(r.id)}>
                  <span className={c('ic not')}>×</span>
                  <span>
                    {r.name}
                    <small>Add an experience that shows it</small>
                  </span>
                  <span className={c('chev')}>›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function BlockList({ blocks, onOpenBlock }: Pick<Props, 'blocks' | 'onOpenBlock'>) {
  return (
    <>
      {GROUPS.map(([group, heading]) => {
        const list = blocks.filter((b) => b.group === group)
        if (!list.length) return null
        return (
          <Fragment key={group}>
            <h4>{heading}</h4>
            <ul className={c('a-reqs')}>
              {list.map((b) => (
                <li key={b.id}>
                  <button className={c('a-req-btn')} type="button" onClick={() => onOpenBlock(b.id)}>
                    <span className={c('ic', b.matched ? 'met' : 'not')}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {BLOCKS_ICON.map((d) => (
                          <path key={d} d={d} />
                        ))}
                      </svg>
                    </span>
                    <span>
                      {b.name}
                      {b.tag ? (
                        <>
                          {' '}
                          <span className={c('nw')}>{b.tag}</span>
                        </>
                      ) : null}
                      <small>{b.sub}</small>
                    </span>
                    <span className={c('chev')}>›</span>
                  </button>
                </li>
              ))}
            </ul>
          </Fragment>
        )
      })}
    </>
  )
}

function StageBar({ pages, saved, busy, saveLabel, onPages, onBack, onSave, onOpenCompose }: Pick<Props, 'pages' | 'saved' | 'busy' | 'saveLabel' | 'onPages' | 'onBack' | 'onSave' | 'onOpenCompose'>) {
  return (
    <div className={c('a-stage-bar')}>
      <span className={c('sp')}>{saved ? 'Saved. Double-click a block to edit it again.' : 'Double-click a block to edit it.'}</span>
      <span className={c('a-seg')} role="group" aria-label="CV length">
        {([1, 2] as const).map((p) => (
          <button key={p} type="button" className={c(pages === p && 'on')} aria-pressed={pages === p} onClick={() => onPages(p)}>
            {p === 1 ? '1 page' : '2 pages'}
          </button>
        ))}
      </span>
      {saved ? (
        <button className={c('a-btn')} type="button" onClick={onOpenCompose}>
          Open in Compose CV
        </button>
      ) : (
        <>
          <button className={c('a-btn')} type="button" onClick={onBack} disabled={busy}>
            Back to drafts
          </button>
          <button className={c('a-btn p')} type="button" onClick={onSave} disabled={busy}>
            {saveLabel}
          </button>
        </>
      )}
    </div>
  )
}

export function ReviewView(props: Props) {
  const { met, notMet, total, blocks, layout, profile, labels, newBlockIds, retitledBlockIds, titles, onOpenRequirement, onOpenBlock, onEditBlock } = props
  const fresh = new Set(newBlockIds)
  const retitled = new Set(retitledBlockIds)
  const entryUi = (e: LayoutEntry): EntryUi => ({
    className: c('cv-block', fresh.has(e.block.id) && 'new'),
    titleMark: retitled.has(e.block.id) ? c('tt-mark') : undefined,
    tabIndex: 0,
    title: 'Double-click to edit',
    onDoubleClick: () => onEditBlock(e.block.id),
    onKeyDown: (ev) => {
      if (ev.key !== 'Enter') return
      ev.preventDefault()
      onEditBlock(e.block.id)
    },
  })
  return (
    <div className={c('a-review')}>
      <section className={c('a-panel a-sum')}>
        <h3>This CV</h3>
        <Requirements met={met} notMet={notMet} total={total} onOpenRequirement={onOpenRequirement} />
        <BlockList blocks={blocks} onOpenBlock={onOpenBlock} />
      </section>
      <div className={c('a-stage')}>
        <StageBar {...props} />
        {titles}
        <CvPreview layout={layout} profile={profile} labels={labels} entryUi={entryUi} />
      </div>
    </div>
  )
}

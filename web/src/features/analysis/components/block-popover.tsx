// A block of this CV, or one left out (the prototype's blockPopover): on the left the block with the words
// that match in yellow, on the right each requirement it matches, the job's words in blue next to yours (H6).
import { Fragment } from 'react'
import type { DraftBullet } from '../../ai/types'
import { hasMark, markSegments } from '../highlight'
import { blockMatchTitle } from '../review-labels'
import { c } from './ui/cx'
import { BlockTag, type BlockTagKind } from './ui/hit-card'
import { Marked } from './ui/marked'
import { Modal } from './ui/modal'

/** A requirement the block matches (or would match): the posting's sentence and keys, and the block's words. */
export type BlockRequirementRow = {
  id: string
  name: string
  /** The posting's sentence behind it (its first quote); null when the AI could not quote it. */
  jobSays: string | null
  jobKeys: string[]
  phrases: string[]
  partly: boolean
}

export type Props = {
  tag: BlockTagKind
  blockName: string
  versionName: string
  title: string
  /** Experience blocks show dates; project blocks show their stack. */
  dates?: string
  stack?: string
  bullets: DraftBullet[]
  requirements: BlockRequirementRow[]
  /** Set for a block left out of this CV: why it is out. */
  leftOutWhy: string | null
  /** When it matches nothing, e.g. "No requirement of this job. It stays because it is recent full-stack experience…". */
  noMatchText?: string | null
  onOpenRequirement: (id: string) => void
  /** "Edit block"; absent for a block left out. */
  onEdit?: () => void
  onClose: () => void
}

function BlockBody({ title, dates, stack, bullets, phrases }: Pick<Props, 'title' | 'dates' | 'stack' | 'bullets'> & { phrases: string[] }) {
  const printed = bullets.filter((b) => b.kind !== 'MISSING' && b.text.trim())
  return (
    <div className={c('a-hl')}>
      {stack ? (
        <>
          <div className={c('r')}>
            <b>{title}</b>
          </div>
          <div className={c('r')}>
            <span>{stack}</span>
          </div>
        </>
      ) : (
        <div className={c('r')}>
          <b>{title}</b>
          <span>{dates}</span>
        </div>
      )}
      <ul>
        {printed.map((b, i) => {
          const segs = markSegments(b.text, phrases)
          return (
            <li key={i} className={c(hasMark(segs) && 'hit')}>
              {segs.map((s, j) =>
                s.mark ? (
                  <mark key={j} className={c('a-mark')}>
                    {s.text}
                  </mark>
                ) : (
                  <span key={j}>{s.text}</span>
                ),
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function RequirementRow({ row, onOpen }: { row: BlockRequirementRow; onOpen: (id: string) => void }) {
  return (
    <button className={c('blk-req')} type="button" onClick={() => onOpen(row.id)}>
      <span className={c('ic', row.partly ? 'part' : 'met')}>{row.partly ? '–' : '✓'}</span>
      <span>
        <b>{row.name}</b>
        {row.partly && <span className={c('pt')}>partly</span>}
        {row.jobSays ? (
          <small>
            <span className={c('lbl')}>JOB SAYS</span>
            <q>
              <Marked text={row.jobSays} phrases={row.jobKeys} tone="job" />
            </q>
          </small>
        ) : null}
        <small>
          <span className={c('lbl')}>YOUR WORDS</span>
          {row.phrases.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && ', '}
              <mark className={c('a-mark')}>{p}</mark>
            </Fragment>
          ))}
        </small>
      </span>
      <span className={c('chev')}>›</span>
    </button>
  )
}

export function BlockPopover({ tag, blockName, versionName, title, dates, stack, bullets, requirements, leftOutWhy, noMatchText, onOpenRequirement, onEdit, onClose }: Props) {
  const out = tag === 'left-out' || tag === 'not-in-cv'
  const phrases = requirements.flatMap((r) => r.phrases)
  return (
    <Modal label={blockName} onClose={onClose}>
      <div className={c('a-pop src-b')}>
        <div className={c('req-h')}>
          <BlockTag kind={tag} />
          <h3>{blockName}</h3>
          <span className={c('a-sub')}>· version “{versionName}”</span>
          <button className={c('x')} type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={c('src-cols')}>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>{out ? 'The block (not in this CV)' : 'The block in this CV'}</span>
            <BlockBody title={title} dates={dates} stack={stack} bullets={bullets} phrases={phrases} />
            {!out && onEdit ? (
              <button className={c('a-btn sm')} type="button" onClick={onEdit}>
                Edit block
              </button>
            ) : null}
          </div>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>{blockMatchTitle(requirements, out)}</span>
            {out && leftOutWhy ? <p className={c('a-sub')}>{leftOutWhy}</p> : null}
            {requirements.length ? (
              <div className={c('blk-list')}>
                {requirements.map((r) => (
                  <RequirementRow key={r.id} row={r} onOpen={onOpenRequirement} />
                ))}
              </div>
            ) : (
              <p className={c('a-sub')}>{noMatchText || 'None of the job’s requirements shows up in this block.'}</p>
            )}
          </div>
        </div>
        <div className={c('foot')}>
          <span className={c('sp')} />
          <button className={c('a-btn')} type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

import type { DraftBullet } from '../../../ai/types'
import { hasMark, markSegments } from '../../highlight'
import { c } from './cx'

export type BlockTagKind = 'new-version' | 'new-block' | 'as-is' | 'left-out' | 'not-in-cv'

const TAGS: Record<BlockTagKind, [string, string]> = {
  'new-version': ['a-new', 'NEW VERSION'],
  'new-block': ['a-new', 'NEW BLOCK'],
  'as-is': ['a-asis', 'AS IS'],
  'left-out': ['a-notmet', 'LEFT OUT'],
  'not-in-cv': ['a-notmet', 'NOT IN THIS CV'],
}

export function BlockTag({ kind }: { kind: BlockTagKind }) {
  const [cls, text] = TAGS[kind]
  return <span className={c(cls)}>{text}</span>
}

type Props = {
  tag: BlockTagKind
  blockName: string
  title: string
  /** Experience blocks show dates; project blocks show their stack. */
  dates?: string
  stack?: string
  bullets: readonly DraftBullet[]
  /** Your words that show the requirement: marked in yellow, their bullet in full colour. */
  phrases: readonly string[]
  onEdit?: () => void
}

/** A block of the CV with the words that match a requirement highlighted, and "Edit block". */
export function HitCard({ tag, blockName, title, dates, stack, bullets, phrases, onEdit }: Props) {
  const printed = bullets.filter((b) => b.kind !== 'MISSING' && b.text.trim())
  return (
    <div className={c('a-hl')}>
      <div className={c('src')}>
        <BlockTag kind={tag} />
        {blockName}
        <span className={c('sp')} />
        {onEdit && (
          <button className={c('a-btn sm')} type="button" onClick={onEdit}>
            Edit block
          </button>
        )}
      </div>
      <div className={c('r')}>
        <b>{title}</b>
        {!stack && dates ? <span>{dates}</span> : null}
      </div>
      {stack ? (
        <div className={c('r')}>
          <span>{stack}</span>
        </div>
      ) : null}
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

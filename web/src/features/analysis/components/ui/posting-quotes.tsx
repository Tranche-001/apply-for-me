import { findQuoteLine, quoteContext, sectionTitle } from '../../highlight'
import { c } from './cx'
import { Marked } from './marked'

type Props = {
  quotes: readonly string[]
  keys: readonly string[]
  /** The saved posting, split with postingLines(). */
  lines: readonly string[]
  /** Show the line before and after each quote, in grey. */
  context?: boolean
}

/** What the job says, word for word (P1): each quote with its section, the keys in blue, and optional context. */
export function PostingQuotes({ quotes, keys, lines, context = false }: Props) {
  if (!quotes.length) return <p className={c('a-sub')}>The AI didn’t quote the posting for this one. Open the full posting to read it.</p>
  return (
    <>
      {quotes.map((q) => {
        const at = findQuoteLine(lines, q)
        const ctx = context ? quoteContext(lines, q) : null
        const where = at >= 0 ? sectionTitle(lines, at) : null
        return (
          <div key={q} className={c('a-srcq')}>
            {where && <span className={c('where')}>IN “{where.toUpperCase()}”</span>}
            {ctx?.before && <span className={c('a-ctx')}>{ctx.before}</span>}
            <q>
              <Marked text={q} phrases={keys} tone="job" />
            </q>
            {ctx?.after && <span className={c('a-ctx')}>{ctx.after}</span>}
          </div>
        )
      })}
    </>
  )
}

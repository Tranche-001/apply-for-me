'use client'

// The prototype's postingPopover: the whole saved posting, the line(s) behind one requirement highlighted
// with their keys marked, scrolled to the first one inside the box. "← Back" returns to where you came from.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { findQuoteLine, sectionTitle } from '../highlight'
import { c } from './ui/cx'
import { Marked } from './ui/marked'
import { Modal } from './ui/modal'

export type Props = {
  /** The saved posting, split with postingLines(). */
  lines: string[]
  /** Where the posting came from, e.g. "jobs.exampleco.com". */
  host: string
  requirementName: string
  /** The requirement's quotes (their lines are highlighted) and keys (marked inside those lines). */
  quotes: string[]
  keys: string[]
  /** Shown after "← Back to ": the requirement in curly quotes (“RAG pipelines”) or a question ("Q1"). */
  backLabel: string
  onBack: () => void
  onClose: () => void
}

type Section = { heading: string | null; lines: { text: string; index: number }[] }
type Layout = { title: string | null; meta: string[]; sections: Section[] }

const stripColon = (line: string) => line.trim().replace(/:$/, '').trim()

/** Same heuristic as sectionTitle(): a line is a heading when sectionTitle, starting there, returns it. */
function isHeading(lines: readonly string[], index: number): boolean {
  const name = stripColon(lines[index])
  return name.length > 0 && sectionTitle(lines, index + 1) === name
}

/**
 * The posting laid out like the prototype. Heading-like lines before any text are its title (the first) and
 * meta line(s) ("ExampleCo · São Paulo · Full-time"); the last of them heads the first section. Then each
 * heading with the lines under it. A highlighted line is never a heading.
 */
function toLayout(lines: readonly string[], hits: ReadonlySet<number>): Layout {
  const heading = (i: number) => !hits.has(i) && isHeading(lines, i)
  const firstText = lines.findIndex((_, i) => !heading(i))
  const leading = firstText < 0 ? lines.length : firstText
  const top = leading >= 2 ? lines.slice(0, leading - 1) : []
  const sections = lines.slice(top.length).reduce<Section[]>((out, text, k) => {
    const index = k + top.length
    if (heading(index)) return [...out, { heading: stripColon(text), lines: [] }]
    const last = out.at(-1) ?? { heading: null, lines: [] }
    const rest = out.length ? out.slice(0, -1) : out
    return [...rest, { ...last, lines: [...last.lines, { text, index }] }]
  }, [])
  return { title: top[0] ?? null, meta: top.slice(1), sections }
}

export function PostingPopover({ lines, host, requirementName, quotes, keys, backLabel, onBack, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const firstHit = useRef<HTMLParagraphElement>(null)
  const hits = useMemo(() => new Set(quotes.map((q) => findQuoteLine(lines, q)).filter((i) => i >= 0)), [lines, quotes])
  const { title, meta, sections } = useMemo(() => toLayout(lines, hits), [lines, hits])
  const first = hits.size ? Math.min(...hits) : -1

  // Centre the first highlighted line inside the posting box only (scrollIntoView would move the page too).
  useLayoutEffect(() => {
    const el = box.current
    const hit = firstHit.current
    if (!el || !hit) return
    const top = hit.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
    el.scrollTop = Math.max(0, top - (el.clientHeight - hit.offsetHeight) / 2)
  }, [first, sections])

  return (
    <Modal label="The job posting" onClose={onClose}>
      <div className={c('a-pop pop-wide')}>
        <div className={c('req-h')}>
          <span className={c('a-met')}>POSTING</span>
          <h3>The job posting</h3>
          <button className={c('x')} type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className={c('a-sub')}>
          {host} · saved with the job. Highlighted: what made the AI list “{requirementName}”.
        </p>
        <div ref={box} className={c('posting')} tabIndex={0} role="region" aria-label="Text of the job posting">
          {title && <div className={c('ttl2')}>{title}</div>}
          {meta.map((m, i) => (
            <div key={i} className={c('meta2')}>
              {m}
            </div>
          ))}
          {sections.map((s, i) => (
            <div key={i}>
              {s.heading && <h4>{s.heading}</h4>}
              {s.lines.map(({ text, index }) =>
                hits.has(index) ? (
                  <p key={index} ref={index === first ? firstHit : undefined} className={c('hit')}>
                    <Marked text={text} phrases={keys} tone="job" />
                  </p>
                ) : (
                  <p key={index}>{text}</p>
                ),
              )}
            </div>
          ))}
        </div>
        <div className={c('foot')}>
          <button className={c('a-btn')} type="button" onClick={onBack}>
            ← Back to {backLabel}
          </button>
          <span className={c('sp')} />
          <button className={c('a-btn')} type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

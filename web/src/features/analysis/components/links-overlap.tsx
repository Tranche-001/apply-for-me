'use client'

// Frame "links overlap" (next-ideas mockup, #same-job): two or more links whose texts repeat each other. Nothing was
// asked of the AI yet; you say "Same job" (one copy of the text, every link saved on the job) or "Different jobs"
// (the texts stay apart and go on to "Which job?"). "Same job" is pressed first (H3: the choice is yours, H5).
import { useState } from 'react'
import { overlapHeading, overlapReason, sameJobNote } from './start-links'
import { c } from './ui/cx'

export type Props = {
  urls: string[]
  /** Share (0–1) of the shorter page's lines found in the other. */
  share: number
  busy: boolean
  onContinue: (same: boolean) => void
  /** "← Use another link": back to the start card, what was typed is still there. */
  onBack: () => void
}

export function LinksOverlap({ urls, share, busy, onContinue, onBack }: Props) {
  const [same, setSame] = useState(true)
  return (
    <div className={c('a-split')}>
      <div className={c('a-overlap')} role="status">
        <b>{overlapHeading(urls.length)}</b>
        <span>{overlapReason(urls, share)}</span>
      </div>
      <div className={c('a-seg')} role="group" aria-label="Same job or different jobs">
        <button type="button" aria-pressed={same} disabled={busy} onClick={() => setSame(true)}>
          Same job
        </button>
        <button type="button" aria-pressed={!same} disabled={busy} onClick={() => setSame(false)}>
          Different jobs
        </button>
      </div>
      <p className={c('a-sub')} aria-live="polite">
        {sameJobNote(same, urls.length)}
      </p>
      <div className={c('foot')}>
        <button className={c('a-link-btn')} type="button" onClick={onBack} disabled={busy}>
          ← Use another link
        </button>
        <span className={c('sp')} />
        <button className={c('a-btn p')} type="button" disabled={busy} onClick={() => onContinue(same)}>
          Continue
        </button>
      </div>
    </div>
  )
}

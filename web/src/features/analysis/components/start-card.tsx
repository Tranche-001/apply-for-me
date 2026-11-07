'use client'

// Frame "start": only the posting's link. "Paste the job text instead" (for sites like LinkedIn that block
// reading) swaps the link for a text box; "← Use a link instead" swaps back. The AI creates the job from it.
import { useState, type FormEvent } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { MAX_POSTING_CHARS } from '../html-text'
import { c } from './ui/cx'

export type Props = {
  busy: boolean
  aiReady: boolean
  /** Shown in amber under the hint when the AI is not connected. */
  notReadyText: string
  /** The last problem reading the link or the text, in plain language. */
  error: string | null
  onAnalyzeUrl: (url: string) => void
  onUsePasted: (text: string) => void
}

/** Same limits and words as savePostingText on the server. */
const MIN_PASTED_CHARS = 80
const NO_LINK = 'Paste a link to the job posting.'
const TOO_SHORT = 'Paste the whole posting: what you pasted is too short to analyze.'
const TOO_LONG = `That is too long (${MAX_POSTING_CHARS.toLocaleString('en')} characters at most). Paste only the posting.`

function pastedProblem(text: string): string | null {
  const length = text.trim().length
  if (length < MIN_PASTED_CHARS) return TOO_SHORT
  if (length > MAX_POSTING_CHARS) return TOO_LONG
  return null
}

export function StartCard({ busy, aiReady, notReadyText, error, onAnalyzeUrl, onUsePasted }: Props) {
  const [mode, setMode] = useState<'link' | 'text'>('link')
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  /** Focus follows a switch between link and text, never the first load. */
  const [switched, setSwitched] = useState(false)
  const blocked = busy || !aiReady
  const shown = problem ?? error

  const switchTo = (next: 'link' | 'text') => {
    setProblem(null)
    setSwitched(true)
    setMode(next)
  }
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    if (blocked) return
    if (mode === 'link') {
      const link = url.trim()
      setProblem(link ? null : NO_LINK)
      if (link) onAnalyzeUrl(link)
      return
    }
    const found = pastedProblem(text)
    setProblem(found)
    if (!found) onUsePasted(text.trim())
  }

  return (
    <form className={c('a-start')} onSubmit={submit} noValidate>
      {mode === 'link' ? (
        <>
          <h3>Paste the link to the job posting</h3>
          <div className={c('a-url')}>
            <div>
              <Icon name="link" />
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label="Link to the job posting"
                aria-invalid={problem ? true : undefined}
                placeholder="https://"
                value={url}
                onChange={(ev) => setUrl(ev.target.value)}
                disabled={busy}
                autoFocus={switched}
              />
            </div>
            <button className={c('a-btn p')} type="submit" disabled={blocked}>
              <Icon name="sparkle" />
              Analyze
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>Paste the text of the job posting</h3>
          <textarea
            className={c('a-ta')}
            aria-label="Text of the job posting"
            aria-invalid={problem ? true : undefined}
            placeholder="The whole posting: the role, what you will do and what they ask for."
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            disabled={busy}
            autoFocus
          />
          <button className={c('a-btn p')} type="submit" disabled={blocked}>
            <Icon name="sparkle" />
            Use this text and analyze
          </button>
        </>
      )}
      {shown && (
        <p className={c('a-err')} role="alert">
          {shown}
        </p>
      )}
      <p className={c('a-hint')}>
        {mode === 'link'
          ? 'The AI reads the posting and creates the job: company, role and link. Then it compares the job with your blocks.'
          : 'The AI reads the text and creates the job: company and role. Then it compares the job with your blocks.'}
      </p>
      {!aiReady && <p className={c('a-warn')}>{notReadyText}</p>}
      <button className={c('a-link-btn')} type="button" onClick={() => switchTo(mode === 'link' ? 'text' : 'link')} disabled={busy}>
        {mode === 'link' ? 'Paste the job text instead' : '← Use a link instead'}
      </button>
    </form>
  )
}

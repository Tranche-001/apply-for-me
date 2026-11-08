'use client'

// Frame "start": the posting's link, or several links of the same job (up to 5). "Paste the job text instead" (for sites like LinkedIn that block
// reading) swaps the link for a text box; "← Use a link instead" swaps back. The AI creates the job from it.
import { Fragment, useRef, useState, type FormEvent } from 'react'
import { Icon } from '@/features/ai/ui/icon'
import { MAX_POSTING_CHARS } from '../html-text'
import { MAX_LINKS, typedLinks } from './start-links'
import { c } from './ui/cx'

export type Props = {
  busy: boolean
  aiReady: boolean
  /** Shown in amber under the hint when the AI is not connected. */
  notReadyText: string
  /** The last problem reading the link or the text, in plain language. */
  error: string | null
  onAnalyzeUrls: (urls: string[]) => void
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

export function StartCard({ busy, aiReady, notReadyText, error, onAnalyzeUrls, onUsePasted }: Props) {
  const [mode, setMode] = useState<'link' | 'text'>('link')
  const [links, setLinks] = useState<string[]>([''])
  const inputs = useRef<(HTMLInputElement | null)[]>([])
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
  const setLink = (index: number, value: string) => setLinks((list) => list.map((l, i) => (i === index ? value : l)))
  const removeLink = (index: number) => setLinks((list) => list.filter((_, i) => i !== index))
  const addLink = () => {
    const next = links.length
    setLinks((list) => [...list, ''])
    // The new row mounts on the next render: focus it then.
    requestAnimationFrame(() => inputs.current[next]?.focus())
  }
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    if (blocked) return
    if (mode === 'link') {
      const typed = typedLinks(links)
      setProblem(typed.length ? null : NO_LINK)
      if (typed.length) onAnalyzeUrls(typed)
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
          <div className={c('a-urls')}>
            {links.map((link, i) => (
              <Fragment key={i}>
                <div className={c(i === 0 ? 'fld on' : 'fld')}>
                  <Icon name="link" />
                  <input
                    ref={(el) => {
                      inputs.current[i] = el
                    }}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={i === 0 ? 'Link to the job posting' : `Link ${i + 1} to the job`}
                    aria-invalid={problem && i === 0 ? true : undefined}
                    placeholder={i === 0 ? 'https://' : 'Another link, e.g. the application page'}
                    value={link}
                    onChange={(ev) => setLink(i, ev.target.value)}
                    disabled={busy}
                    autoFocus={switched && i === 0}
                  />
                  {i > 0 && (
                    <button className={c('rm')} type="button" aria-label="Remove this link" onClick={() => removeLink(i)} disabled={busy}>
                      ×
                    </button>
                  )}
                </div>
                {i === 0 ? (
                  <button className={c('a-btn p')} type="submit" disabled={blocked}>
                    <Icon name="sparkle" />
                    Analyze
                  </button>
                ) : (
                  <span />
                )}
              </Fragment>
            ))}
          </div>
          {links.length < MAX_LINKS ? (
            <button className={c('a-add')} type="button" onClick={addLink} disabled={busy}>
              + Add another link
            </button>
          ) : (
            <p className={c('a-hint')}>Up to {MAX_LINKS} links per job.</p>
          )}
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
          ? 'The AI reads every link (the posting, the application page…) and creates the job: company, role and links. Then it compares the job with your blocks.'
          : 'The AI reads the text and creates the job: company and role. Then it compares the job with your blocks.'}
      </p>
      {!aiReady && <p className={c('a-warn')}>{notReadyText}</p>}
      <button className={c('a-link-btn')} type="button" onClick={() => switchTo(mode === 'link' ? 'text' : 'link')} disabled={busy}>
        {mode === 'link' ? 'Paste the job text instead' : '← Use a link instead'}
      </button>
    </form>
  )
}

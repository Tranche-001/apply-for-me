'use client'

// The line under the steps: what the AI is doing now ("Reading the posting…"), or, when something failed,
// a plain-language message in amber (like AiError) with an optional Retry.
import { c } from './ui/cx'

export type Props = {
  text: string
  /** 'progress' (default): the prototype's .a-status line. 'error': amber, announced, with Retry when given. */
  tone?: 'progress' | 'error'
  onRetry?: () => void
}

export function StatusLine({ text, tone = 'progress', onRetry }: Props) {
  if (tone === 'error') {
    return (
      <p className={c('a-status err')} role="alert">
        {text}
        {onRetry && (
          <>
            {' '}
            <button className={c('retry')} type="button" onClick={onRetry}>
              Retry
            </button>
          </>
        )}
      </p>
    )
  }
  return (
    <p className={c('a-status')} role="status">
      {text}
    </p>
  )
}

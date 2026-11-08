// Read → Compare → Your input → Drafts → Review & save (H1). The prototype's steps(cur): a pill per step,
// ✓ when done, the current one outlined. An <ol>/<li> instead of <div>/<span> so the order is announced.
import { Fragment } from 'react'
import { STEP_NAMES } from '../types'
import { c } from './ui/cx'

export type Props = {
  /** Index of the current step; STEP_NAMES.length means every step is done. */
  current: number
  /**
   * The dashed "Which job?" pill after "Read posting", only when the AI found more than one job: 'cur' while the
   * user chooses (then no other step is current, so pass the index of the step after "Read posting"), 'done' after.
   */
  extra?: 'cur' | 'done' | null
}

const EXTRA_NAME = 'Which job?'

export function Steps({ current, extra = null }: Props) {
  return (
    <ol className={c('a-steps')} aria-label="Progress">
      {STEP_NAMES.map((name, i) => {
        const state = i < current ? 'done' : i === current && extra !== 'cur' ? 'cur' : null
        return (
          <Fragment key={name}>
            <li className={c('a-step', state)} aria-current={state === 'cur' ? 'step' : undefined}>
              <i>{i < current ? '✓' : i + 1}</i>
              {name}
            </li>
            {i === 0 && extra && (
              <li className={c('a-step extra', extra)} aria-current={extra === 'cur' ? 'step' : undefined}>
                <i>{extra === 'done' ? '✓' : '?'}</i>
                {EXTRA_NAME}
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}

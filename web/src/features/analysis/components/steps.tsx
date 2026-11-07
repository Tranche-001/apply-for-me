// Read → Compare → Your input → Drafts → Review & save (H1). The prototype's steps(cur): a pill per step,
// ✓ when done, the current one outlined. An <ol>/<li> instead of <div>/<span> so the order is announced.
import { STEP_NAMES } from '../types'
import { c } from './ui/cx'

export type Props = {
  /** Index of the current step; STEP_NAMES.length means every step is done. */
  current: number
}

export function Steps({ current }: Props) {
  return (
    <ol className={c('a-steps')} aria-label="Progress">
      {STEP_NAMES.map((name, i) => {
        const state = i < current ? 'done' : i === current ? 'cur' : null
        return (
          <li key={name} className={c('a-step', state)} aria-current={state === 'cur' ? 'step' : undefined}>
            <i>{i < current ? '✓' : i + 1}</i>
            {name}
          </li>
        )
      })}
    </ol>
  )
}

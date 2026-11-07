// After Save (the prototype's "saved" frame): what was saved and for which job, and the way to the next job (H1).
import { savedBannerText } from '../review-labels'
import { c } from './ui/cx'

export type Props = {
  /** Versions and blocks saved to the library (new versions + new blocks). */
  savedCount: number
  /** "ExampleCo · Senior GenAI Engineer". */
  jobLabel: string
  onAnalyzeAnother: () => void
}

export function SavedBanner({ savedCount, jobLabel, onAnalyzeAnother }: Props) {
  return (
    <div className={c('a-ok-banner')} role="status">
      {savedBannerText(savedCount, jobLabel)}
      <span className={c('sp')} />
      <button className={c('a-btn sm')} type="button" onClick={onAnalyzeAnother}>
        Analyze another job
      </button>
    </div>
  )
}

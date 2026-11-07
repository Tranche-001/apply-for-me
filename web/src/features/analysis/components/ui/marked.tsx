import { markSegments } from '../../highlight'
import { c } from './cx'

/** Text with matched words marked: yellow for your CV's words, blue for the posting's own words. */
export function Marked({ text, phrases, tone = 'cv' }: { text: string; phrases: readonly string[]; tone?: 'cv' | 'job' }) {
  const mark = tone === 'job' ? 'a-key' : 'a-mark'
  return (
    <>
      {markSegments(text, phrases).map((s, i) =>
        s.mark ? (
          <mark key={i} className={c(mark)}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

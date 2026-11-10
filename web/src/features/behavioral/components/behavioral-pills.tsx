// The two views of Behavioral, switched by two pills under the BEHAVIORAL label (decision log), and the language
// you answer in. The chosen job and language carry over through the link.
import Link from 'next/link'
import { Icon } from '@/features/ai/ui/icon'
import { behavioralQuery, LANGS, type Lang } from '../types'

const PILL = 'inline-flex h-[38px] items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold no-underline'
const ON = `${PILL} border border-[var(--indigo)] bg-[var(--indigo)] text-white shadow-[0_2px_8px_rgba(67,56,202,0.25)] hover:bg-[var(--indigo-hover)] hover:text-white`
const OFF = `${PILL} border border-[var(--border-strong)] bg-white text-[var(--text-2)] hover:border-[var(--indigo)] hover:text-[var(--indigo-hover)]`

const SEG = 'h-[30px] rounded-md px-3 text-[13px]'
const SEG_ON = `${SEG} bg-white font-semibold text-[var(--text)] shadow-[0_1px_2px_rgba(20,22,27,0.1)]`
const SEG_OFF = `${SEG} bg-transparent font-medium text-[var(--muted)] hover:text-[var(--text)]`

export function BehavioralPills({ current, jobId, lang }: { current: 'answers' | 'interview'; jobId: string | null; lang: Lang }) {
  const query = behavioralQuery(jobId, lang)
  return (
    <nav aria-label="Behavioral views" className="flex flex-wrap gap-2">
      <Link href={`/behavioral${query}`} aria-current={current === 'answers' ? 'page' : undefined} className={current === 'answers' ? ON : OFF}>
        <Icon name="pen" size={15} />
        Interview answers
      </Link>
      <Link
        href={`/behavioral/interview${query}`}
        aria-current={current === 'interview' ? 'page' : undefined}
        className={current === 'interview' ? ON : OFF}
      >
        <Icon name="eye" size={15} />
        Interview mode
      </Link>
    </nav>
  )
}

/** "Answers in: English | Português". Each language keeps its own answers; switching never translates. */
export function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (next: Lang) => void }) {
  return (
    <div role="group" aria-labelledby="lang-h" className="flex items-center gap-2">
      <span id="lang-h" className="text-[12.5px] font-medium text-[var(--muted)]">
        Answers in
      </span>
      <div className="flex gap-0.5 rounded-lg bg-[#e6e7ea] p-[3px]">
        {LANGS.map((l) => (
          <button key={l.id} type="button" aria-pressed={lang === l.id} onClick={() => onChange(l.id)} className={lang === l.id ? SEG_ON : SEG_OFF}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// The two views of Behavioral, switched by two pills under the BEHAVIORAL label (decision log).
// The chosen job carries over through the link.
import Link from 'next/link'
import { Icon } from '@/features/ai/ui/icon'

const PILL = 'inline-flex h-[38px] items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold no-underline'
const ON = `${PILL} border border-[var(--indigo)] bg-[var(--indigo)] text-white shadow-[0_2px_8px_rgba(67,56,202,0.25)] hover:bg-[var(--indigo-hover)] hover:text-white`
const OFF = `${PILL} border border-[var(--border-strong)] bg-white text-[var(--text-2)] hover:border-[var(--indigo)] hover:text-[var(--indigo-hover)]`

export function BehavioralPills({ current, jobId }: { current: 'answers' | 'interview'; jobId: string | null }) {
  const query = jobId ? `?job=${encodeURIComponent(jobId)}` : ''
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

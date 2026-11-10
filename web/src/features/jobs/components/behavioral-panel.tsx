import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { C, MONO, cls, iconB } from '@/components/ui/styles'
import type { BehavioralForJobs, JobData } from '../types'

type Props = { job: JobData; behavioral: BehavioralForJobs; onClose: () => void }

/**
 * Read only: the job's answered behavioral questions, the adapted answer when there is one, otherwise
 * the generalist one, labelled (decision log: "See behavioral" on Jobs).
 */
export function BehavioralPanel({ job, behavioral, onClose }: Props) {
  const company = job.company || job.label
  // English first; a question answered only in Portuguese shows that one, labelled.
  const items = behavioral.questions
    .map((q, i) => {
      const n = String(i + 1).padStart(2, '0')
      for (const lang of ['en', 'pt'] as const) {
        const adapted = (behavioral.tailored[`${q.id}|${job.id}|${lang}`] ?? '').trim()
        const answer = adapted || q.answers[lang].trim()
        if (answer) return { q, n, lang, adapted: !!adapted, answer }
      }
      return { q, n, lang: 'en' as const, adapted: false, answer: '' }
    })
    .filter((x) => x.answer)
  const someAdapted = items.some((x) => x.adapted)
  // "See behavioral" folds away when the panel opens; the focus moves here instead of being lost.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <aside aria-labelledby="beh-h" style={{ flex: '1 1 340px', minWidth: 300, maxHeight: 'calc(100vh - 72px)', overflowY: 'auto', boxSizing: 'border-box', background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 id="beh-h" ref={heading} tabIndex={-1} style={{ outline: 'none', margin: 0, fontSize: 14, fontWeight: 600 }}>Behavioral for {job.label}</h2>
          <span style={{ fontSize: 12, color: C.muted }}>
            {items.length} of {behavioral.questions.length} questions answered{someAdapted ? ', some adapted to this job' : ''}
          </span>
        </div>
        <button type="button" className={cls.iconB} onClick={onClose} aria-label="Hide behavioral" style={iconB(28)}>
          <Icon name="close" />
        </button>
      </div>
      {items.map((x) => (
        <article key={x.q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 12, borderBottom: `1px solid ${C.hairline}` }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px' }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>{x.n}</span>
            <h3 lang="pt-BR" style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{x.q.short}</h3>
            <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(x.adapted ? { background: C.indigoSoft, color: C.indigoInk } : { background: '#F1F2F4', color: C.text2 }) }}>
              {x.adapted ? `Adapted for ${company}` : 'Generalist'}
              {x.lang === 'pt' ? ' · Português' : ''}
            </span>
          </div>
          <p lang={x.lang === 'pt' ? 'pt-BR' : 'en'} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: C.ink }}>{x.answer}</p>
        </article>
      ))}
      {items.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: C.muted }}>
          No answers yet. Write them in <Link href="/behavioral">Behavioral</Link>.
        </p>
      )}
      <Link href="/behavioral" style={{ fontSize: 12.5, fontWeight: 500 }}>Edit answers in Behavioral</Link>
    </aside>
  )
}

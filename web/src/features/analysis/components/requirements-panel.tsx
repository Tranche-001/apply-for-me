'use client'

// "What the job asks for" (the prototype's reqPanel): the requirements grouped Covered / Partial / Missing,
// each a button that opens what the job says next to how your blocks cover it, or why they don't yet.
import { Fragment } from 'react'
import type { JobAnalysis, JobRequirement, RequirementStatus } from '@/features/ai/types'
import { jobReqLine } from '../coverage'
import { c } from './ui/cx'

export type Props = {
  analysis: JobAnalysis | null
  /** 'before' the answers are sent (the line says which question asks), 'after' (drafts count too). */
  phase: 'before' | 'after'
  /** A version id (as is / left out) or a draft key → the block's name. */
  blockNameOf: (id: string) => string
  onOpen: (requirementId: string) => void
}

const GROUPS: readonly { status: RequirementStatus; label: string }[] = [
  { status: 'covered', label: 'Covered' },
  { status: 'partial', label: 'Partial' },
  { status: 'missing', label: 'Missing' },
]

/** The icon's class and glyph per status, as in the prototype. */
const ICON: Record<RequirementStatus, readonly [string, string]> = {
  covered: ['met', '✓'],
  partial: ['part', '–'],
  missing: ['not', '×'],
}

export function RequirementsPanel({ analysis, phase, blockNameOf, onOpen }: Props) {
  if (!analysis) {
    return (
      <section className={c('a-panel')}>
        <h3>What the job asks for</h3>
        <p className={c('a-sub')}>The AI lists what the job asks for and which of your blocks show it.</p>
      </section>
    )
  }
  const list = analysis.requirements
  const count = (status: RequirementStatus) => list.filter((r) => r.status === status).length
  const partial = count('partial')

  const item = (r: JobRequirement) => {
    const [cls, glyph] = ICON[r.status]
    const covered = r.status === 'covered'
    return (
      <li key={r.id}>
        <button
          className={c('a-req-btn', !covered && 'not')}
          type="button"
          aria-label={`${r.text}: see how ${covered ? 'it is' : 'it is not'} covered`}
          onClick={() => onOpen(r.id)}
        >
          <span className={c('ic', cls)}>{glyph}</span>
          <span>
            {r.text}
            <small>{jobReqLine(r.status, r.id, analysis, phase, blockNameOf)}</small>
          </span>
          <span className={c('chev')}>›</span>
        </button>
      </li>
    )
  }

  return (
    <section className={c('a-panel a-sum')}>
      <h3>What the job asks for</h3>
      <h4>
        Requirements{' '}
        <span className={c('ct')}>
          · {count('covered')} of {list.length} covered{partial ? ` · ${partial} partial` : ''}
        </span>
      </h4>
      {GROUPS.map(({ status, label }) => {
        const inGroup = list.filter((r) => r.status === status)
        if (!inGroup.length) return null
        return (
          <Fragment key={status}>
            <p className={c('a-reqs-sub')}>{label}</p>
            <ul className={c('a-reqs')}>{inGroup.map(item)}</ul>
          </Fragment>
        )
      })}
    </section>
  )
}

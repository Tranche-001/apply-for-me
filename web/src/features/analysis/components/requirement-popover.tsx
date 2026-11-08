'use client'

// The prototype's jobReqPopover (option B): what the job says, word for word, next to how your blocks cover
// the requirement, or why they don't. A gap shows the AI's question about it, or "+ Add experience" once the
// answers are in.
import type { ComponentProps } from 'react'
import type { JobRequirement, ProfileEvidence, RequirementStatus } from '@/features/ai/types'
import { HitCard } from './ui/hit-card'
import { ProfileCard } from './ui/profile-card'
import { c } from './ui/cx'
import { Modal } from './ui/modal'
import { PostingQuotes } from './ui/posting-quotes'

export type HitCardProps = ComponentProps<typeof HitCard>

export type Props = {
  requirement: JobRequirement
  /** The saved posting, split with postingLines(). */
  postingLines: string[]
  /** The blocks that show the requirement, with their matching words. */
  hits: HitCardProps[]
  /** Profile items (Education, skills, achievements) that show it, with their matching words. */
  profile?: ProfileEvidence[]
  /** The AI's question about this gap (before the answers are sent). */
  ask: { n: number; text: string } | null
  /** A missing requirement after the answers: offer to add an experience that shows it. */
  showAddExperience: boolean
  onOpenPosting: () => void
  onAnswer: () => void
  onAddExperience: () => void
  onClose: () => void
}

const HEAD: Record<RequirementStatus, { tag: string; cls: string; title: string }> = {
  covered: { tag: 'COVERED', cls: 'a-met', title: 'How it is covered' },
  partial: { tag: 'PARTIAL', cls: 'a-part', title: 'How it is partly covered' },
  missing: { tag: 'MISSING', cls: 'a-notmet', title: 'Why it is not covered' },
}

function Next({ ask, showAddExperience, onAnswer, onAddExperience }: Pick<Props, 'ask' | 'showAddExperience' | 'onAnswer' | 'onAddExperience'>) {
  if (ask) {
    return (
      <div className={c('a-ask-q')}>
        <span className={c('pv-k')}>The AI asks about it</span>
        <p>
          Q{ask.n} · {ask.text}
        </p>
        <button className={c('a-btn p sm')} type="button" onClick={onAnswer}>
          Answer Q{ask.n} ›
        </button>
      </div>
    )
  }
  if (!showAddExperience) return null
  return (
    <button className={c('a-btn p sm')} type="button" onClick={onAddExperience}>
      + Add experience
    </button>
  )
}

export function RequirementPopover({ requirement, postingLines, hits, profile = [], ask, showAddExperience, onOpenPosting, onAnswer, onAddExperience, onClose }: Props) {
  const head = HEAD[requirement.status]
  const covered = requirement.status === 'covered'
  return (
    <Modal label={requirement.text} onClose={onClose}>
      <div className={c('a-pop src-b')}>
        <div className={c('req-h')}>
          <span className={c(head.cls)}>{head.tag}</span>
          <h3>{requirement.text}</h3>
          <button className={c('x')} type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className={c('src-cols')}>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>The job says</span>
            <PostingQuotes quotes={requirement.quotes} keys={requirement.keys} lines={postingLines} context />
            {postingLines.length > 0 && (
              <button className={c('a-link2')} type="button" onClick={onOpenPosting}>
                See it in the full posting
              </button>
            )}
          </div>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>{head.title}</span>
            {requirement.evidence && <p className={c('a-sub')}>{requirement.evidence}</p>}
            {hits.map((hit, i) => (
              <HitCard key={`${i}-${hit.blockName}`} {...hit} />
            ))}
            {profile.map((p, i) => (
              <ProfileCard key={`p${i}-${p.title}`} evidence={p} />
            ))}
            {!covered && <Next ask={ask} showAddExperience={showAddExperience} onAnswer={onAnswer} onAddExperience={onAddExperience} />}
          </div>
        </div>
        <div className={c('foot')}>
          <span className={c('sp')} />
          <button className={c('a-btn')} type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

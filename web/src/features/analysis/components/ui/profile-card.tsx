// A profile item that shows a requirement (next-ideas mockup, #education): its section as a tag, "From your profile",
// "Edit profile", and the item with the words that show the requirement marked (P1, H6).
import Link from 'next/link'
import type { ProfileEvidence } from '../../../ai/types'
import { PROFILE_SECTION } from '../../coverage'
import { c } from './cx'
import { Marked } from './marked'

export function ProfileCard({ evidence }: { evidence: ProfileEvidence }) {
  const { kind, title, dates, detail, phrases } = evidence
  return (
    <div className={c('a-hl')}>
      <div className={c('src')}>
        <span className={c('a-new')}>{PROFILE_SECTION[kind].toUpperCase()}</span>
        From your profile
        <span className={c('sp')} />
        <Link className={c('a-btn sm')} href="/profile">
          Edit profile
        </Link>
      </div>
      <div className={c('r')}>
        <b>
          <Marked text={title} phrases={phrases} />
        </b>
        {dates ? (
          <span>
            <Marked text={dates} phrases={phrases} />
          </span>
        ) : null}
      </div>
      {detail ? (
        <div className={c('pf-detail')}>
          <Marked text={detail} phrases={phrases} />
        </div>
      ) : null}
    </div>
  )
}

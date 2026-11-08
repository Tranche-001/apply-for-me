import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { C, SANS, SERIF, cls } from '@/components/ui/styles'
import type { ProfileData, ProfileKind } from '@/features/profile/types'
import { PROFILE_HEADINGS } from '@/features/profile/types'
import { SECTION_NAMES, printedBullets, type CvLayout, type LayoutEntry, type PageSection } from '../layout'

// The CV header. The schema has no place for your name and contact yet (see the report), so it is the
// line printed on every CV file, word for word.
const CV_NAME = 'Guilherme Motta Tranche'
const CV_CONTACT = ['tranche@usp.br', 'LinkedIn', 'GitHub']

export type EntryHighlight = 'none' | 'hover' | 'flash' | 'peek'

export type EntryUi = {
  highlight?: EntryHighlight
  onClick?: () => void
  onDoubleClick?: () => void
  title?: string
  /** Job analysis review: its own look (hover outline, the "NEW" margin tag). */
  className?: string
  /** With onKeyDown, lets the keyboard reach the block (Enter edits it on Job analysis). */
  tabIndex?: number
  onKeyDown?: (ev: KeyboardEvent<HTMLDivElement>) => void
  /** Job analysis review: the title is wrapped in a <mark> with this class (a role title that is not the one you had). */
  titleMark?: string
}

type Props = {
  layout: CvLayout
  profile: ProfileData
  labels: { text: string; beyond: boolean }[]
  /** Compose: clicking a block opens its versions, double-clicking edits it. Jobs: read only. */
  entryUi?: (entry: LayoutEntry) => EntryUi
  onProfileClick?: (kind: ProfileKind) => void
}

const HIGHLIGHT: Record<EntryHighlight, CSSProperties> = {
  peek: { background: '#FFFFFF', boxShadow: `0 0 0 1.5px ${C.indigo}` },
  flash: { background: C.indigoSoft, boxShadow: `0 0 0 1px ${C.indigoLine}` },
  hover: { background: C.page },
  none: {},
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0 10px', lineHeight: 1.35 }

/** A double-click edits; it must not select a word on the page. */
function noSelect(ev: MouseEvent) {
  if (ev.detail > 1) ev.preventDefault()
}

function Entry({ entry, ui }: { entry: LayoutEntry; ui: EntryUi }) {
  const { block, version } = entry
  const interactive = !!ui.onClick
  const className = [interactive ? cls.pvEn : '', ui.className ?? ''].filter(Boolean).join(' ')
  return (
    <div
      id={`pv-${block.id}`}
      className={className || undefined}
      onClick={ui.onClick}
      onDoubleClick={ui.onDoubleClick}
      onMouseDown={interactive || ui.onDoubleClick ? noSelect : undefined}
      onKeyDown={ui.onKeyDown}
      tabIndex={ui.tabIndex}
      title={ui.title}
      style={{ position: 'relative', scrollMarginTop: 110, display: 'flex', flexDirection: 'column', gap: 1, margin: '0 -6px', padding: '2px 6px', borderRadius: 4, ...HIGHLIGHT[ui.highlight ?? 'none'] }}
    >
      {entry.peeked && (
        <span style={{ position: 'absolute', top: -9, right: 4, padding: '1px 6px', borderRadius: 4, background: C.indigo, color: '#FFFFFF', fontFamily: SANS, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em' }}>
          PREVIEW
        </span>
      )}
      {block.section === 'PROJECT' ? (
        <div style={{ fontSize: 12, lineHeight: 1.35 }}>
          <strong>{ui.titleMark ? <mark className={ui.titleMark}>{version.title}</mark> : version.title}</strong> | <em>{block.stack}</em>
        </div>
      ) : (
        <>
          <div style={{ ...row, alignItems: 'baseline' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{ui.titleMark ? <mark className={ui.titleMark}>{version.title}</mark> : version.title}</span>
            <span style={{ fontSize: 11 }}>{block.dates}</span>
          </div>
          <div style={{ ...row, fontSize: 11, fontStyle: 'italic' }}>
            <span>{block.org}</span>
            <span>{block.location}</span>
          </div>
        </>
      )}
      <ul style={{ margin: '2px 0 0', paddingLeft: 16, listStyle: 'disc' }}>
        {printedBullets(version).map((b, i) => (
          <li key={i} style={{ fontSize: 11, lineHeight: 1.32, marginTop: i ? 1 : 0 }}>
            {b.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfileBox({ kind, onClick, children, style }: { kind: ProfileKind; onClick?: (kind: ProfileKind) => void; children: ReactNode; style: CSSProperties }) {
  return (
    <div
      className={onClick ? cls.pvEn : undefined}
      onClick={onClick ? () => onClick(kind) : undefined}
      title={onClick ? `Click to edit ${PROFILE_HEADINGS[kind]}` : undefined}
      style={{ margin: '0 -6px', borderRadius: 4, ...style }}
    >
      {children}
    </div>
  )
}

function SectionView({ section, profile, entryUi, onProfileClick }: { section: PageSection; profile: ProfileData } & Pick<Props, 'entryUi' | 'onProfileClick'>) {
  const name = section.kind === 'entries' ? (section.name ?? SECTION_NAMES[section.section]) : PROFILE_HEADINGS[section.kind === 'edu' ? 'education' : section.kind === 'skills' ? 'skills' : 'achievements']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {section.heading && (
        <h3 style={{ margin: 0, paddingBottom: 1, borderBottom: `1px solid ${C.paperInk}`, fontSize: 13, lineHeight: 1.25, fontWeight: 600, fontVariant: 'small-caps', letterSpacing: '0.03em' }}>{name}</h3>
      )}
      {section.kind === 'edu' && (
        <ProfileBox kind="education" onClick={onProfileClick} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '2px 6px' }}>
          {profile.education.map((ed) => (
            <div key={ed.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <div style={{ ...row, alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{ed.degree}</span>
                <span style={{ fontSize: 11 }}>{ed.dates}</span>
              </div>
              <div style={{ ...row, fontSize: 11, fontStyle: 'italic' }}>
                <span>{ed.school}</span>
                <span>{ed.location}</span>
              </div>
            </div>
          ))}
        </ProfileBox>
      )}
      {section.kind === 'entries' && section.entries.map((e) => <Entry key={e.key} entry={e} ui={entryUi ? entryUi(e) : {}} />)}
      {section.kind === 'skills' && (
        <ProfileBox kind="skills" onClick={onProfileClick} style={{ display: 'flex', flexDirection: 'column', padding: '0 6px' }}>
          {profile.skills.map((sk) => (
            <div key={sk.id} style={{ fontSize: 11, lineHeight: 1.45 }}>
              <strong>{sk.label}:</strong> {sk.text}
            </div>
          ))}
        </ProfileBox>
      )}
      {section.kind === 'ach' && (
        <ProfileBox kind="achievements" onClick={onProfileClick} style={{ padding: '2px 6px', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px 18px' }}>
          {profile.achievements.map((ac) => (
            <div key={ac.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 11.5, lineHeight: 1.35, fontWeight: 700 }}>{ac.title}</span>
              <span style={{ fontSize: 11, lineHeight: 1.35, fontStyle: 'italic' }}>{ac.description}</span>
            </div>
          ))}
        </ProfileBox>
      )}
    </div>
  )
}

/** The CV drawn like the LaTeX output: 680 px pages, Source Serif, real page breaks (H2). */
export function CvPreview({ layout, profile, labels, entryUi, onProfileClick }: Props) {
  return (
    <>
      {layout.pages.map((page, pi) => {
        const label = labels[pi] ?? { text: `Page ${pi + 1}`, beyond: false }
        return (
          <div key={pi} style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontFamily: SANS, color: label.beyond ? C.amber : C.muted, fontWeight: label.beyond ? 600 : 500 }}>{label.text}</span>
            <article
              aria-label={`Page ${pi + 1}`}
              style={{
                aspectRatio: '8.5 / 11',
                boxSizing: 'border-box',
                background: '#FFFFFF',
                padding: '28px 34px',
                fontFamily: SERIF,
                color: C.paperInk,
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                overflow: 'hidden',
                boxShadow: label.beyond ? `0 0 0 2px ${C.amberButton}, 0 6px 20px rgba(20, 22, 27, 0.08)` : '0 6px 20px rgba(20, 22, 27, 0.1)',
              }}
            >
              {pi === 0 && (
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 22, lineHeight: 1.15, fontWeight: 700, fontVariant: 'small-caps', letterSpacing: '0.01em' }}>{CV_NAME}</div>
                  <div style={{ fontSize: 11.5, lineHeight: 1.35 }}>
                    {CV_CONTACT.map((c, i) => (
                      <span key={c}>
                        {i > 0 && ' · '}
                        <span style={i > 0 ? { textDecoration: 'underline' } : undefined}>{c}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {page.sections.map((s, si) => (
                <SectionView key={si} section={s} profile={profile} entryUi={entryUi} onProfileClick={onProfileClick} />
              ))}
            </article>
          </div>
        )
      })}
    </>
  )
}

/** Shown where a CV would be when there is none. */
export function NoCv({ text }: { text: string }) {
  return (
    <p style={{ width: '100%', maxWidth: 680, boxSizing: 'border-box', margin: 0, padding: 24, borderRadius: 10, border: '1px dashed #C9CDD4', background: C.well, textAlign: 'center', fontSize: 13, color: C.muted, fontFamily: SANS }}>
      {text}
    </p>
  )
}


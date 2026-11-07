'use client'

// A requirement no block of this CV shows (the prototype's notMetPopover): what the posting says next to a
// form to write down an experience that shows it. The AI adds it to Experiences and drafts a block (P1, P2).
import { useId, useRef, useState, type ReactNode } from 'react'
import type { JobRequirement } from '../../ai/types'
import { addedToLabel, requirementTopic } from '../review-labels'
import { c } from './ui/cx'
import { Modal } from './ui/modal'
import { PostingQuotes } from './ui/posting-quotes'

const NEW_EXPERIENCE = '__new__'
const CHIPS = ['Something I did', 'A number or result', 'What was hard'] as const

export type NotMetSubmit = { experienceId: string | null; newExperienceTitle: string | null; text: string }

export type Props = {
  requirement: JobRequirement
  /** The saved posting, split with postingLines(). */
  postingLines: string[]
  /** Why the CV doesn't claim it, e.g. "You answered “Don’t have it” to Q3, so the CV doesn’t claim it." */
  why: string
  experiences: { id: string; title: string }[]
  busy: boolean
  /** Set once the experience was added: the popover says where. */
  done: { place: string; isNew: boolean } | null
  error: string | null
  onOpenPosting: () => void
  onSubmit: (v: NotMetSubmit) => void
  onClose: () => void
}

function Header({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div className={c('req-h')}>
      <span className={c('a-notmet')}>NOT MET</span>
      <h3>{name}</h3>
      <button className={c('x')} type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  )
}

function Shell({ requirement, onClose, children }: { requirement: JobRequirement; onClose: () => void; children: ReactNode }) {
  return (
    <Modal label={requirement.text} onClose={onClose}>
      {children}
    </Modal>
  )
}

export function NotMetPopover({ requirement, postingLines, why, experiences, busy, done, error, onOpenPosting, onSubmit, onClose }: Props) {
  const [where, setWhere] = useState(NEW_EXPERIENCE)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [empty, setEmpty] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const errId = useId()

  if (done) {
    return (
      <Shell requirement={requirement} onClose={onClose}>
        <div className={c('a-pop src-b')}>
          <Header name={requirement.text} onClose={onClose} />
          <div className={c('a-done-msg')} role="status">
            <b>{addedToLabel(done.place, done.isNew)}</b>
            <span>
              The AI is drafting a block for “{requirement.text}” from what you wrote. It appears in Blocks for this CV with Keep, Edit and Discard, and this requirement moves to Met once you keep it.
            </span>
          </div>
          <div className={c('foot')}>
            <span className={c('sp')} />
            <button className={c('a-btn p')} type="button" onClick={onClose} autoFocus>
              Back to the CV
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const addChip = (chip: string) => {
    const body = text.replace(/\s+$/, '')
    setText(`${body ? `${body}\n\n` : ''}${chip}: `)
    setEmpty(false)
    area.current?.focus()
  }
  const submit = () => {
    if (busy) return
    const written = text.trim()
    if (!written) {
      setEmpty(true)
      area.current?.focus()
      return
    }
    const isNew = where === NEW_EXPERIENCE
    onSubmit({ experienceId: isNew ? null : where, newExperienceTitle: isNew ? name.trim() || null : null, text: written })
  }

  return (
    <Shell requirement={requirement} onClose={onClose}>
      <form
        className={c('a-pop src-b')}
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault()
          submit()
        }}
      >
        <Header name={requirement.text} onClose={onClose} />
        <div className={c('src-cols')}>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>The posting says</span>
            <PostingQuotes quotes={requirement.quotes} keys={requirement.keys} lines={postingLines} context />
            <button className={c('a-link2')} type="button" onClick={onOpenPosting}>
              See it in the full posting
            </button>
          </div>
          <div className={c('src-col')}>
            <span className={c('pv-k')}>Add an experience that shows it</span>
            <p className={c('a-sub')}>
              No block in this CV shows it. {why} If you have done it since, write it down: the AI adds it to your Experiences and drafts a block for this CV.
            </p>
            <label className={c('a-field')}>
              Where did you do it?
              <select className={c('a-sel')} value={where} onChange={(ev) => setWhere(ev.target.value)}>
                {experiences.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
                <option value={NEW_EXPERIENCE}>New experience…</option>
              </select>
            </label>
            {where === NEW_EXPERIENCE && (
              <label className={c('a-field')}>
                Name of the new experience
                <input className={c('a-in')} value={name} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. a personal project, a course, a job" />
              </label>
            )}
            <label className={c('a-field')}>
              What did you do?
              <textarea
                ref={area}
                className={c('a-ta')}
                value={text}
                onChange={(ev) => {
                  setText(ev.target.value)
                  if (empty && ev.target.value.trim()) setEmpty(false)
                }}
                placeholder={`What you built with ${requirementTopic(requirement)}, for whom, and what came out of it. Numbers help.`}
                aria-invalid={empty || undefined}
                aria-describedby={empty ? errId : undefined}
              />
            </label>
            <div className={c('a-chips')}>
              {CHIPS.map((chip) => (
                <button key={chip} className={c('a-chip-btn')} type="button" onClick={() => addChip(chip)}>
                  + {chip}
                </button>
              ))}
            </div>
            {empty && (
              <p className={c('a-err')} id={errId} role="alert">
                Write what you did first: the AI only uses what you write.
              </p>
            )}
            {error && (
              <p className={c('a-err')} role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className={c('foot')}>
          <button className={c('a-link-btn')} type="button" onClick={onClose}>
            Cancel
          </button>
          <span className={c('sp')} />
          <button className={c('a-btn p')} type="submit" disabled={busy} aria-busy={busy || undefined}>
            Add to Experiences and draft a block
          </button>
        </div>
      </form>
    </Shell>
  )
}

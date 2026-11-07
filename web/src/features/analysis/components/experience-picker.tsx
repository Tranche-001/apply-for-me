'use client'

// "Goes to" (the prototype's picker): closed, one line with where the answer goes (AI’S PICK / NEW, or amber
// "Choose an experience" with the AI's suggested new one and "Use it"). Open, a fixed-height list: search, the
// AI's suggestions first, every experience A–Z scrolling inside itself, and "New experience" pinned below.
// Picking an experience closes the list; picking "New experience" keeps it open to name it; Esc closes it.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { newNameFromQuery, pickerGroups, type PickerExperience } from '../picker'
import { c } from './ui/cx'

/** Where an answer goes: nowhere yet, one of your experiences, or a new one with its name. */
export type PickerValue = { kind: 'none' } | { kind: 'existing'; id: string } | { kind: 'new'; name: string }

export type Props = {
  askId: string
  /** The question's number, for the list's label ("Experience for Q4"). */
  n: number
  experiences: { id: string; title: string }[]
  /** The experience the AI chose (its id), if any. */
  aiPick: string | null
  /** Other experiences the answer also fits (ids). */
  alsoFits: string[]
  /** The name the AI suggests for a new experience, when none of yours fits. */
  suggestNew: string | null
  value: PickerValue
  open: boolean
  onToggle(open: boolean): void
  onChange(value: PickerValue): void
}

/** The prototype's search icon. */
const SEARCH = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export function ExperiencePicker({ askId, n, experiences, aiPick, alsoFits, suggestNew, value, open, onToggle, onChange }: Props) {
  const [query, setQuery] = useState('')
  /** The new experience's name while "New experience" is not the choice yet (the AI's suggestion first). */
  const [draftName, setDraftName] = useState(value.kind === 'new' ? value.name : (suggestNew ?? ''))
  const trigger = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const nameField = useRef<HTMLInputElement>(null)

  // Opening the list puts you in its search.
  useEffect(() => {
    if (open) search.current?.focus()
  }, [open])

  const name = value.kind === 'new' ? value.name : draftName
  const title = value.kind === 'existing' ? (experiences.find((e) => e.id === value.id)?.title ?? '') : ''
  const label = value.kind === 'none' ? 'Choose an experience' : value.kind === 'new' ? value.name.trim() || 'New experience' : title

  const close = () => {
    onToggle(false)
    trigger.current?.focus()
  }
  const toggle = () => {
    setQuery('')
    onToggle(!open)
  }
  const onEsc = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !open) return
    ev.preventDefault() // the list closes, the modal stays
    close()
  }
  const rename = (next: string) => {
    setDraftName(next)
    if (value.kind === 'new') onChange({ kind: 'new', name: next })
  }
  // Arrow keys only move the choice (radios fire change on arrows); a click or Enter takes it and closes the list.
  const pick = (id: string) => onChange({ kind: 'existing', id })
  const takeOnClick = (ev: { detail: number }) => {
    if (ev.detail > 0) close()
  }
  const takeOnEnter = (ev: KeyboardEvent) => {
    if (ev.key !== 'Enter') return
    ev.preventDefault()
    close()
  }
  const pickNew = () => onChange({ kind: 'new', name })
  const focusName = () => nameField.current?.focus()
  // "Use it" takes the AI's new experience; its line goes away, so focus goes back to "Goes to".
  const takeSuggestion = () => {
    onChange({ kind: 'new', name: draftName })
    trigger.current?.focus()
  }
  // A search that matches nothing becomes the new experience's name.
  const onSearch = (next: string) => {
    setQuery(next)
    const typed = newNameFromQuery(next, !pickerGroups({ all: experiences, aiPick, alsoFits, query: next }).empty)
    if (typed) rename(typed)
  }

  const triggerEl = (
    <button
      ref={trigger}
      className={c('pk-trigger', value.kind === 'none' && 'need')}
      type="button"
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={onEsc}
    >
      <span className={c('pk-val')}>{label}</span>
      {value.kind === 'new' && <span className={c('a-badge')}>NEW</span>}
      {value.kind === 'existing' && value.id === aiPick && <span className={c('a-aipick')}>AI’S PICK</span>}
      <span className={c('pk-chev')} aria-hidden="true">
        {open ? '▲' : '▼'}
      </span>
    </button>
  )

  if (!open) {
    return (
      <>
        {triggerEl}
        {value.kind === 'none' && suggestNew && (
          <p className={c('pk-sugg')}>
            The AI suggests a new experience: <b>{suggestNew}</b>
            <button className={c('pk-use')} type="button" onClick={takeSuggestion}>
              Use it
            </button>
          </p>
        )}
      </>
    )
  }

  // The options keep their place while you search (it only hides what doesn't match), like the prototype.
  const q = query.trim()
  const base = pickerGroups({ all: experiences, aiPick, alsoFits, query: '' })
  const found = pickerGroups({ all: experiences, aiPick, alsoFits, query })
  const matching = new Set(found.rest.map((e) => e.id))
  const shown = (e: PickerExperience) => !q || matching.has(e.id)
  const radio = `pk-${askId}`
  const option = (e: PickerExperience, tag?: 'ai' | 'also') => (
    <label key={e.id} className={c('pk-opt')} onClick={takeOnClick}>
      <input type="radio" name={radio} value={e.id} checked={value.kind === 'existing' && value.id === e.id} onChange={() => pick(e.id)} onKeyDown={takeOnEnter} />
      <span>{e.title}</span>
      {tag === 'ai' && <span className={c('a-aipick')}>AI’S PICK</span>}
      {tag === 'also' && <span className={c('pk-also')}>also fits</span>}
    </label>
  )

  return (
    <>
      {triggerEl}
      <div className={c('pk')} onKeyDown={onEsc}>
        <div className={c('pk-search')}>
          {SEARCH}
          <input
            ref={search}
            type="search"
            value={query}
            placeholder={`Search ${experiences.length} experiences`}
            aria-label="Search your experiences"
            onChange={(ev) => onSearch(ev.target.value)}
          />
        </div>
        <div className={c('pk-list')} role="radiogroup" aria-label={`Experience for Q${n}`}>
          {!q && <p className={c('pk-group')}>Suggested by the AI</p>}
          {base.suggested.length > 0
            ? base.suggested.filter(shown).map((e) => option(e, e.tag))
            : !q && <p className={c('pk-none')}>None of your experiences fits. The AI suggests a new one, below.</p>}
          {!q && <p className={c('pk-group')}>All experiences</p>}
          {base.rest.filter(shown).map((e) => option(e))}
          {found.empty && <p className={c('pk-empty')}>No experience matches. Create it as a new one, below.</p>}
        </div>
        <label className={c('pk-new')}>
          <input
            type="radio"
            name={radio}
            value="new"
            checked={value.kind === 'new'}
            onChange={pickNew}
            onClick={(ev) => {
              if (ev.detail > 0) focusName()
            }}
            onKeyDown={(ev) => {
              if (ev.key !== 'Enter') return
              ev.preventDefault()
              focusName()
            }}
          />
          <span>New experience</span>
          <input
            ref={nameField}
            className={c('pk-new-name')}
            type="text"
            value={name}
            placeholder="Name it"
            aria-label="Name of the new experience"
            onChange={(ev) => rename(ev.target.value)}
          />
        </label>
      </div>
      {suggestNew && <p className={c('pk-note')}>The AI suggested the new name from your answer. You can change it.</p>}
    </>
  )
}

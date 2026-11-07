'use client'

// "Check where your answers go" (the prototype's option B, chosen): the questions on the left, each with where
// its answer goes; the one you pick, in full on the right (question, your answer, why the AI chose that place,
// and "Goes to"). The first that needs a place opens first; "Add and update drafts" waits until all have one.
import { useState } from 'react'
import { ExperiencePicker, type PickerValue } from './experience-picker'
import { c } from './ui/cx'
import { Modal } from './ui/modal'

export type PlacementItem = {
  askId: string
  n: number
  /** What the question is about, e.g. "Kubernetes". */
  topic: string
  question: string
  answer: string
  /** The experience the AI placed the answer in (its id); null = it couldn't tell. */
  aiPick: string | null
  alsoFits: string[]
  /** Why the AI chose that place, or why it couldn't. */
  why: string
  suggestNew: string | null
}

export type Destination = { kind: 'existing'; id: string } | { kind: 'new'; name: string }

export type Props = {
  items: PlacementItem[]
  /** Questions you don't have ("I don't have this"): listed, nothing to add. */
  skipped: { n: number; topic: string }[]
  experiences: { id: string; title: string }[]
  busy: boolean
  onConfirm(dest: Record<string, Destination>): void
  onNotNow(): void
  onClose(): void
}

type Status = { cls: 'ai' | 'you' | 'need'; icon: string; text: string }

const startValue = (it: PlacementItem, experiences: Props['experiences']): PickerValue =>
  it.aiPick && experiences.some((e) => e.id === it.aiPick) ? { kind: 'existing', id: it.aiPick } : { kind: 'none' }

/** A chosen place as [askId, destination]; nothing while it has none. A new one left unnamed is "New experience", as shown. */
function destinationOf(v: PickerValue, askId: string): [string, Destination][] {
  if (v.kind === 'existing') return [[askId, v]]
  if (v.kind === 'new') return [[askId, { kind: 'new', name: v.name.trim() || 'New experience' }]]
  return []
}

/** The questions the AI couldn't place come first (as in the prototype), the rest in their order. */
function needFirst(items: PlacementItem[], experiences: Props['experiences']): PlacementItem[] {
  const needs = (it: PlacementItem) => startValue(it, experiences).kind === 'none'
  return [...items.filter(needs), ...items.filter((it) => !needs(it))]
}

export function PlacementPopover({ items, skipped, experiences, busy, onConfirm, onNotNow, onClose }: Props) {
  const [dest, setDest] = useState<Record<string, PickerValue>>(() => Object.fromEntries(items.map((it) => [it.askId, startValue(it, experiences)])))
  const [selected, setSelected] = useState<string | null>(() => needFirst(items, experiences)[0]?.askId ?? null)
  /** The question whose "Goes to" list is open (closed by default). */
  const [openList, setOpenList] = useState<string | null>(null)

  const list = needFirst(items, experiences)
  const sel = list.find((it) => it.askId === selected) ?? list[0]
  if (!sel) return null

  const valueOf = (it: PlacementItem): PickerValue => dest[it.askId] ?? { kind: 'none' }
  const statusOf = (it: PlacementItem): Status => {
    const v = valueOf(it)
    if (v.kind === 'none') return { cls: 'need', icon: '!', text: 'Needs a place' }
    if (v.kind === 'new') return { cls: 'you', icon: '✓', text: `${v.name.trim() || 'New experience'} (new)` }
    return { cls: v.id === it.aiPick ? 'ai' : 'you', icon: '✓', text: experiences.find((e) => e.id === v.id)?.title ?? '' }
  }
  const missing = list.filter((it) => valueOf(it).kind === 'none')
  const blocked = missing.length > 0 || busy
  const placed = items.filter((it) => it.aiPick).length
  const selStatus = statusOf(sel)

  const select = (askId: string) => {
    setSelected(askId)
    setOpenList(null)
  }
  const confirm = () => {
    if (blocked) return
    onConfirm(Object.fromEntries(list.flatMap((it) => destinationOf(valueOf(it), it.askId))))
  }

  return (
    <Modal label="Check where your answers go" onClose={onClose}>
      <div className={c('a-pop pv pv-b')}>
        <div className={c('req-h')}>
          <h3>Check where your answers go</h3>
          <button className={c('x')} type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className={c('a-sub')}>
          {`The AI placed ${placed} of your ${items.length} answers. Click a question to see your answer and change where it goes.`}
        </p>
        <div className={c('pv-split')}>
          <div className={c('pv-side')}>
            {list.map((it) => {
              const s = statusOf(it)
              const on = it.askId === sel.askId
              return (
                <button key={it.askId} className={c('pv-side-row', on && 'on')} type="button" aria-pressed={on} onClick={() => select(it.askId)}>
                  <span className={c('pv-ic', s.cls)}>{s.icon}</span>
                  <span>
                    <b>{`Q${it.n}`}</b>
                    {it.topic}
                    <small className={c(s.cls)}>{s.text}</small>
                  </span>
                </button>
              )
            })}
            {skipped.map((s) => (
              <div key={s.n} className={c('pv-skip')}>
                <span className={c('pv-ic skip')}>–</span>
                <span>
                  <b>{`Q${s.n}`}</b>
                  {s.topic}
                  <small>You don’t have it: nothing to add.</small>
                </span>
              </div>
            ))}
          </div>
          <div className={c('pv-main')}>
            <div className={c('pv-main-h')}>
              <span className={c('pv-ic', selStatus.cls)}>{selStatus.icon}</span>
              {`Q${sel.n} · ${sel.topic}`}
            </div>
            <div className={c('pv-detail')}>
              <div className={c('pv-field')}>
                <span className={c('pv-k')}>Question</span>
                <p>{sel.question}</p>
              </div>
              <div className={c('pv-field')}>
                <span className={c('pv-k')}>Your answer</span>
                <p className={c('pv-ans')}>{sel.answer}</p>
              </div>
              <div className={c('pv-field')}>
                <span className={c('pv-k')}>Goes to</span>
                <p className={c('pv-why')}>{sel.why}</p>
                <ExperiencePicker
                  key={sel.askId}
                  askId={sel.askId}
                  n={sel.n}
                  experiences={experiences}
                  aiPick={sel.aiPick}
                  alsoFits={sel.alsoFits}
                  suggestNew={sel.suggestNew}
                  value={valueOf(sel)}
                  open={openList === sel.askId}
                  onToggle={(open) => setOpenList(open ? sel.askId : null)}
                  onChange={(v) => setDest((d) => ({ ...d, [sel.askId]: v }))}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={c('foot')}>
          <button className={c('a-link-btn')} type="button" onClick={onNotNow}>
            {`Not now: keep ${missing.length ? 'it' : 'them'} in “Answers to the AI’s questions”`}
          </button>
          <span className={c('sp')} />
          {missing.length > 0 && <span className={c('pv-hint')}>{`Pick a place for ${missing.map((it) => `Q${it.n}`).join(', ')}`}</span>}
          <button className={c('a-btn p', blocked && 'dis')} type="button" disabled={blocked} onClick={confirm}>
            Add and update drafts
          </button>
        </div>
      </div>
    </Modal>
  )
}

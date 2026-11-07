'use client'

// Edit an AI draft before keeping it (P2): title, and each bullet's kind and text. A bullet left empty
// becomes a gap ("Missing") instead of being filled in for you.
import type { BulletKind } from '@prisma/client'
import { BULLET_KINDS } from '../context-types'
import type { DraftBullet } from '../types'
import { bulletKindName, DraftBulletLine } from './bullet-tag'
import { Icon } from './icon'

const EDITABLE_KINDS = BULLET_KINDS.filter((k) => k !== 'MISSING')

export function DraftPreview({ title, bullets }: { title: string; bullets: DraftBullet[] }) {
  return (
    <>
      <span className="cv-serif text-[13.5px] font-semibold leading-[1.3]">{title || <em className="text-[var(--muted)]">No title</em>}</span>
      {bullets.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-[3px] p-0">
          {bullets.map((b, i) => (
            <DraftBulletLine key={i} kind={b.kind} text={b.text} want={b.want} />
          ))}
        </ul>
      )}
    </>
  )
}

type FieldsProps = {
  idPrefix: string
  title: string
  bullets: DraftBullet[]
  onChange: (next: { title: string; bullets: DraftBullet[] }) => void
}

export function DraftFields({ idPrefix, title, bullets, onChange }: FieldsProps) {
  const setBullet = (index: number, patch: Partial<DraftBullet>) =>
    onChange({ title, bullets: bullets.map((b, i) => (i === index ? { ...b, ...patch } : b)) })
  const setKind = (index: number, kind: BulletKind) => {
    const b = bullets[index]
    // Choosing a kind for a gap turns it into a bullet you write yourself.
    setBullet(index, { kind, want: null, text: b.kind === 'MISSING' ? '' : b.text })
  }
  const remove = (index: number) => onChange({ title, bullets: bullets.filter((_, i) => i !== index) })
  const add = () => onChange({ title, bullets: [...bullets, { kind: 'PROJECT', text: '', want: null }] })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-[3px]">
        <label htmlFor={`${idPrefix}-title`} className="text-[11.5px] font-medium text-[var(--muted)]">
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => onChange({ title: e.target.value, bullets })}
          className="cv-serif h-8 rounded-md border border-[var(--border-strong)] bg-white px-2 text-[13px]"
        />
      </div>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {bullets.map((b, i) => (
          <li key={i} className="flex flex-col gap-1 rounded-md border border-[#eef0f3] p-1.5">
            <div className="flex items-center gap-1.5">
              <label htmlFor={`${idPrefix}-k${i}`} className="sr-only">
                Kind of bullet {i + 1}
              </label>
              <select
                id={`${idPrefix}-k${i}`}
                value={b.kind === 'MISSING' ? '' : b.kind}
                onChange={(e) => setKind(i, e.target.value as BulletKind)}
                className="h-7 rounded-md border border-[var(--border-strong)] bg-white px-1 text-[12px]"
              >
                {b.kind === 'MISSING' && <option value="">{b.want ? `${bulletKindName(b.want)} (missing)` : 'Missing'}</option>}
                {EDITABLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {bulletKindName(k)}
                  </option>
                ))}
              </select>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove bullet ${i + 1}`}
                className="flex h-7 w-7 items-center justify-center rounded-md border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--page)]"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
            {b.kind === 'MISSING' ? (
              <p className="m-0 text-[11.5px] italic text-[var(--amber)]">Gap: pick a kind above to write it yourself, or leave it as a gap.</p>
            ) : (
              <>
                <label htmlFor={`${idPrefix}-t${i}`} className="sr-only">
                  Text of bullet {i + 1}
                </label>
                <textarea
                  id={`${idPrefix}-t${i}`}
                  value={b.text}
                  rows={2}
                  onChange={(e) => setBullet(i, { text: e.target.value })}
                  className="cv-serif min-h-[44px] resize-none rounded-md border border-[var(--border-strong)] bg-white px-2 py-1 text-[12.5px] leading-[1.45] [field-sizing:content]"
                />
              </>
            )}
          </li>
        ))}
      </ol>
      {bullets.length < 4 && (
        <button type="button" className="btn-s self-start" onClick={add}>
          <Icon name="plus" size={12} />
          Add bullet
        </button>
      )}
    </div>
  )
}

/** Bullets as they will be saved: written ones trimmed, empty written ones dropped, gaps kept. */
export function bulletsToSave(bullets: DraftBullet[]): DraftBullet[] {
  return bullets
    .map((b) => (b.kind === 'MISSING' ? { kind: b.kind, text: '', want: b.want ?? null } : { kind: b.kind, text: b.text.trim(), want: null }))
    .filter((b) => b.kind === 'MISSING' || b.text)
}

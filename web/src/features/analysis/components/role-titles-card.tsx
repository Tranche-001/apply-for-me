// "Role titles for this job" (prototype next-ideas.html #titles): for each experience on the CV, three options in one
// radio group: the AI's title (from the job's role), the title you have, or one you write. "You have" is picked until
// you choose (P2); the CV beside it shows the pick, highlighted when it is not the title you had.
import type { RoleTitleRow } from '../role-titles'
import type { TitleChoice, TitlePick } from '../types'
import { c } from './ui/cx'

export type Props = {
  /** The job's role, as the job has it ("AI Builder"). */
  jobRole: string
  rows: RoleTitleRow[]
  /** After Save the picks are shown, not changed (Open in Compose CV changes the saved CV). */
  disabled: boolean
  onPick: (key: string, choice: TitleChoice) => void
}

const OPTIONS: { pick: TitlePick; label: string }[] = [
  { pick: 'ai', label: 'AI recommends' },
  { pick: 'mine', label: 'You have' },
  { pick: 'own', label: 'Write my own' },
]

function valueOf(row: RoleTitleRow, pick: TitlePick): string {
  // The AI's option is its role alone; picked, the CV prints it with the place of the title you have.
  if (pick === 'ai') return row.aiRole || row.ai
  if (pick === 'mine') return row.have
  return row.choice.own.trim() || '+ New title'
}

function Row({ row, index, disabled, onPick }: { row: RoleTitleRow; index: number } & Pick<Props, 'disabled' | 'onPick'>) {
  const name = `tt-${index}`
  const ownId = `tt-own-${index}`
  return (
    <div className={c('tt')}>
      <b id={`${name}-label`}>{row.blockName}</b>
      <div className={c('tt-opts')} role="radiogroup" aria-labelledby={`${name}-label`}>
        {OPTIONS.map((o) => (
          <label key={o.pick} className={c('tt-opt', row.choice.pick === o.pick && 'on')}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o.pick}
              checked={row.choice.pick === o.pick}
              disabled={disabled}
              onChange={() => onPick(row.key, { ...row.choice, pick: o.pick })}
            />
            <small>{o.label}</small>
            <span>{valueOf(row, o.pick)}</span>
          </label>
        ))}
      </div>
      {row.choice.pick === 'own' && (
        <>
          <label className="sr-only" htmlFor={ownId}>
            Your title at {row.blockName}
          </label>
          <input
            id={ownId}
            className={c('tt-own')}
            type="text"
            maxLength={120}
            placeholder={`Your title at ${row.blockName}`}
            value={row.choice.own}
            disabled={disabled}
            // Picking "Write my own" is asking to type: the field takes the focus when it appears.
            autoFocus
            onChange={(e) => onPick(row.key, { pick: 'own', own: e.target.value })}
          />
        </>
      )}
      {row.changed && row.updatesVersion && <p className={c('tt-note')}>Save as “Update {row.updatesVersion}” puts this title in that version everywhere it is used.</p>}
    </div>
  )
}

export function RoleTitlesCard({ jobRole, rows, disabled, onPick }: Props) {
  if (!rows.length) return null
  return (
    <section className={c('tt-card')} aria-labelledby="tt-head">
      <h4 id="tt-head">Role titles for this job</h4>
      <b className={c('tt-ask')}>The job is for {jobRole}. Pick the title for each role.</b>
      <div>
        {rows.map((row, i) => (
          <Row key={row.key} row={row} index={i} disabled={disabled} onPick={onPick} />
        ))}
      </div>
      <p className={c('tt-note')}>Highlighted on the CV = a title that is not the one you already had.</p>
    </section>
  )
}

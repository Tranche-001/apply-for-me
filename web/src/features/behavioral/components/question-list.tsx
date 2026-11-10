'use client'

import { useRowDrag } from '@/features/analysis/components/use-row-drag'
import { questionStatus, tailoredCount, type Lang, type QuestionItem, type TailoredMap } from '../types'
import { AddQuestion } from './add-question'

type Props = {
  questions: QuestionItem[]
  /** The generalist answer in the chosen language. */
  answerOf: (questionId: string) => string
  lang: Lang
  tailored: TailoredMap
  selectedId: string
  onSelect: (id: string) => void
  onAdded: (id: string) => void
  /** Dragging: `from` takes `to`'s place on screen (saved on drop). */
  onMoveTo: (from: string, to: string) => void
  /** Alt+↑ / Alt+↓ on a question: one place up or down, saved right away. */
  onMoveBy: (id: string, delta: number) => void
  /** The drag ended; `moved` = the question changed place, so the new order is saved. */
  onDropped: (id: string, moved: boolean) => void
}

// Rows are buttons, so a press on the row itself may start a drag; only fields and links inside never do.
const NO_DRAG = 'input, textarea, a, form'

// Wide screens: the list stays put (sticky, scrolling on its own) while the question beside it changes
// height, so the row you clicked never jumps under the mouse. Press and drag a row to reorder (same look as before);
// a click without moving just selects it.
export function QuestionList({ questions, answerOf, lang, tailored, selectedId, onSelect, onAdded, onMoveTo, onMoveBy, onDropped }: Props) {
  const drag = useRowDrag({ onMoveTo, onDrop: onDropped, drawn: questions.map((q) => q.id).join('|'), ignore: NO_DRAG })
  return (
    <section
      aria-labelledby="ql-h"
      className="flex min-w-0 flex-[1_1_300px] flex-col rounded-xl border border-[var(--border)] bg-white p-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
    >
      <h2 id="ql-h" className="m-0 shrink-0 px-2.5 pb-2 pt-2.5 text-[13px] font-semibold text-[var(--muted)]">
        {questions.length} questions
      </h2>
      {questions.map((q) => {
        const on = q.id === selectedId
        const answer = answerOf(q.id)
        const answered = Boolean(answer.trim())
        return (
          <button
            key={q.id}
            type="button"
            data-row={q.id}
            onClick={() => onSelect(q.id)}
            onPointerDown={(e) => drag.onPointerDown(e, q.id)}
            onKeyDown={(e) => {
              if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
              e.preventDefault()
              onMoveBy(q.id, e.key === 'ArrowUp' ? -1 : 1)
            }}
            aria-pressed={on}
            aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
            className={`flex min-h-[44px] shrink-0 select-none items-start gap-2.5 rounded-lg border p-2.5 text-left ${drag.dragging === q.id ? 'cursor-grabbing' : ''} ${
              on ? 'border-[var(--indigo-line)] bg-[var(--indigo-soft)] text-[var(--text)]' : 'border-transparent bg-transparent text-[#22252c] hover:bg-[#f6f7f9]'
            }`}
          >
            <span className="w-[22px] flex-none pt-px font-mono text-[12px] text-[var(--muted)]">{q.n}</span>
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span lang="pt-BR" className="text-[14px] font-medium leading-[1.35]">
                {q.short}
              </span>
              <span className={`text-[12px] ${answered ? 'font-medium text-[var(--ok-ink)]' : 'text-[var(--muted)]'}`}>
                {questionStatus(answer, tailoredCount(tailored, q.id, lang))}
              </span>
            </span>
          </button>
        )
      })}
      <AddQuestion onAdded={onAdded} />
    </section>
  )
}

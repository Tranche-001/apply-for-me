'use client'

import { questionStatus, tailoredCount, type QuestionItem, type TailoredMap } from '../types'

type Props = {
  questions: QuestionItem[]
  answers: Record<string, string>
  tailored: TailoredMap
  selectedId: string
  onSelect: (id: string) => void
}

export function QuestionList({ questions, answers, tailored, selectedId, onSelect }: Props) {
  return (
    <section aria-labelledby="ql-h" className="flex min-w-0 flex-[1_1_300px] flex-col rounded-xl border border-[var(--border)] bg-white p-2">
      <h2 id="ql-h" className="m-0 px-2.5 pb-2 pt-2.5 text-[13px] font-semibold text-[var(--muted)]">
        {questions.length} questions
      </h2>
      {questions.map((q) => {
        const on = q.id === selectedId
        const answered = Boolean((answers[q.id] ?? '').trim())
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onSelect(q.id)}
            aria-pressed={on}
            className={`flex min-h-[44px] items-start gap-2.5 rounded-lg border p-2.5 text-left ${
              on ? 'border-[var(--indigo-line)] bg-[var(--indigo-soft)] text-[var(--text)]' : 'border-transparent bg-transparent text-[#22252c] hover:bg-[#f6f7f9]'
            }`}
          >
            <span className="w-[22px] flex-none pt-px font-mono text-[12px] text-[var(--muted)]">{q.n}</span>
            <span className="flex min-w-0 flex-auto flex-col gap-1">
              <span lang="pt-BR" className="text-[14px] font-medium leading-[1.35]">
                {q.short}
              </span>
              <span className={`text-[12px] ${answered ? 'font-medium text-[var(--ok-ink)]' : 'text-[var(--muted)]'}`}>
                {questionStatus(answers[q.id] ?? '', tailoredCount(tailored, q.id))}
              </span>
            </span>
          </button>
        )
      })}
    </section>
  )
}

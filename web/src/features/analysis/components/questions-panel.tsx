'use client'

// "Questions about the gaps": answer what you can, mark "Don't have it", then update the drafts.
// Each answer also goes to Experiences, at the end of the experience it is about ("Adds to"), so the
// next draft — and every future job — can use it. What is already written there is never changed.
import Link from 'next/link'
import type { AiAsk } from '@/features/ai/types'
import { Icon } from '@/features/ai/ui/icon'
import { ANSWERS_TITLE } from '@/features/experiences/types'
import type { ExperienceOption, FiledAnswer } from '../types'

type Props = {
  asks: AiAsk[] | null
  answers: Record<string, string>
  noAnswer: Record<string, boolean>
  onAnswer: (id: string, text: string) => void
  onToggleNoAnswer: (id: string) => void
  onRedraft: () => void
  busy: boolean
  experiences: ExperienceOption[]
  /** Where each question's answer goes: an experience id, or "" for "Answers to the AI's questions". */
  destination: (ask: AiAsk) => string
  onDestination: (id: string, experienceId: string) => void
  filed: Record<string, FiledAnswer>
  fileError: string | null
}

export function QuestionsPanel(props: Props) {
  const { asks, answers, noAnswer, onAnswer, onToggleNoAnswer, onRedraft, busy, fileError, filed } = props
  const touched = asks?.some((a) => (answers[a.id] ?? '').trim() || noAnswer[a.id]) ?? false
  // Answers to questions the AI no longer asks (they are settled): where they went stays visible.
  const earlier = filedElsewhere(filed, asks ?? [])
  return (
    <section
      aria-labelledby="q-h"
      className="box-border flex max-h-[calc(100vh-140px)] min-w-0 flex-[1_1_290px] flex-col gap-2.5 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-white px-3.5 py-3"
    >
      <div className="flex flex-col gap-px">
        <h2 id="q-h" className="m-0 text-[14px] font-semibold">
          Questions about the gaps
        </h2>
        <span className="text-[12px] text-[var(--muted)]">Answer what you can. Skip the rest. Each answer is also added to your Experiences.</span>
      </div>
      {asks === null && <p className="m-0 border-t border-[#eef0f3] pt-2 text-[12.5px] text-[var(--muted)]">The AI asks here instead of guessing what you did.</p>}
      {asks?.length === 0 && <p className="m-0 border-t border-[#eef0f3] pt-2 text-[12.5px] text-[var(--muted)]">No questions: your blocks already cover what the job asks for.</p>}
      {earlier.length > 0 && (
        <p className="m-0 flex flex-wrap items-center gap-x-1 border-t border-[#eef0f3] pt-2 text-[11.5px] leading-[1.5] text-[var(--ok-ink)]">
          <Icon name="check" size={12} />
          Your earlier {earlier.reduce((n, e) => n + e.count, 0) === 1 ? 'answer was' : 'answers were'} added to
          {earlier.map((e, i) => (
            <span key={e.experienceId}>
              <Link href={`/experiences?open=${encodeURIComponent(e.experienceId)}`} className="font-medium underline underline-offset-2">
                {e.title}
              </Link>
              {e.count > 1 ? ` (${e.count})` : ''}
              {i < earlier.length - 1 ? ',' : '.'}
            </span>
          ))}
        </p>
      )}
      {asks?.map((q, i) => {
        const skipped = Boolean(noAnswer[q.id])
        return (
          <div key={q.id} className="flex flex-col gap-[5px] border-t border-[#eef0f3] pt-2">
            <p className="m-0 text-[12.5px] leading-[1.45] text-[#22252c]">
              <span className="font-mono text-[10.5px] text-[var(--amber)]">Q{i + 1} </span>
              {q.text}
            </p>
            <div className="flex items-start gap-1.5">
              <label htmlFor={`ask-${q.id}`} className="sr-only">
                Answer to question {i + 1}
              </label>
              <textarea
                id={`ask-${q.id}`}
                rows={1}
                value={answers[q.id] ?? ''}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                disabled={skipped}
                placeholder={skipped ? 'You don’t have it: the AI won’t draft this.' : '[Your answer]'}
                className="min-h-[30px] min-w-0 flex-auto resize-none rounded-md border border-[var(--border-strong)] px-2 py-[5px] text-[12.5px] leading-[1.4] [field-sizing:content] disabled:bg-[#f6f7f9]"
              />
              <button
                type="button"
                aria-pressed={skipped}
                onClick={() => onToggleNoAnswer(q.id)}
                className={`h-[30px] flex-none rounded-md border px-2 text-[11.5px] font-medium ${
                  skipped ? 'border-[var(--amber-line)] bg-[var(--amber-soft)] text-[var(--amber-ink)]' : 'border-[var(--border-strong)] bg-white text-[var(--text-2)] hover:border-[var(--indigo)]'
                }`}
              >
                Don’t have it
              </button>
            </div>
            {!skipped && <Destination ask={q} index={i} answer={(answers[q.id] ?? '').trim()} {...props} />}
          </div>
        )
      })}
      {fileError && (
        <p role="alert" className="m-0 text-[12px] leading-[1.4] text-[var(--danger)]">
          {fileError}
        </p>
      )}
      {asks && asks.length > 0 && (
        <button type="button" className="btn-p justify-center" onClick={onRedraft} disabled={busy || !touched}>
          <Icon name="sparkle" size={13} />
          Update drafts with my answers
        </button>
      )}
    </section>
  )
}

/** Experiences that got answers to questions no longer on screen, with how many each. */
function filedElsewhere(filed: Record<string, FiledAnswer>, asks: AiAsk[]): { experienceId: string; title: string; count: number }[] {
  const byPlace = new Map<string, { experienceId: string; title: string; count: number }>()
  for (const [askId, f] of Object.entries(filed)) {
    if (asks.some((a) => a.id === askId)) continue
    const place = byPlace.get(f.experienceId) ?? { experienceId: f.experienceId, title: f.title, count: 0 }
    byPlace.set(f.experienceId, { ...place, count: place.count + 1 })
  }
  return [...byPlace.values()]
}

/** "Adds to [experience ▾]" before the answer is sent; "✓ Added to <experience>" after. */
function Destination({ ask, index, answer, experiences, destination, onDestination, filed }: Props & { ask: AiAsk; index: number; answer: string }) {
  const done = filed[ask.id]
  if (done && done.answer === answer) {
    return (
      <p className="m-0 flex items-center gap-1 text-[11.5px] text-[var(--ok-ink)]">
        <Icon name="check" size={12} />
        Added to
        <Link href={`/experiences?open=${encodeURIComponent(done.experienceId)}`} className="font-medium underline underline-offset-2">
          {done.title}
        </Link>
      </p>
    )
  }
  const hasAnswersPlace = experiences.some((e) => e.title === ANSWERS_TITLE)
  return (
    <label className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[var(--muted)]">
      <span className="flex-none">Adds to</span>
      <select
        aria-label={`Experience the answer to question ${index + 1} is added to`}
        value={destination(ask)}
        onChange={(e) => onDestination(ask.id, e.target.value)}
        className="h-[26px] min-w-0 max-w-full flex-auto truncate rounded-md border border-[var(--border)] bg-white px-1.5 text-[11.5px] text-[var(--text-2)]"
      >
        {experiences.map((e) => (
          <option key={e.id} value={e.id}>
            {e.title}
          </option>
        ))}
        {!hasAnswersPlace && <option value="">{ANSWERS_TITLE} (new)</option>}
      </select>
    </label>
  )
}

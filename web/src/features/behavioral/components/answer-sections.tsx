'use client'

// The generalist answer and the answer adapted to a job. The AI's text replaces yours only as a draft:
// it says what it did, and Undo brings your text back (P2, H3).
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { draftAnswer, reviseAnswer } from '@/features/ai/actions'
import { AiChanges, AiError } from '@/features/ai/ui/ai-changes'
import { NOT_READY } from '@/features/ai/provider'
import { Icon } from '@/features/ai/ui/icon'
import { htmlLang, LANGS, type JobOption, type Lang } from '../types'

const langLabel = (lang: Lang) => LANGS.find((l) => l.id === lang)?.label ?? lang

/** Each language is written by you; the other language's answer is never copied or translated here. */
const GENERALIST_PLACEHOLDER: Record<Lang, string> = {
  en: '[Write your best all-purpose answer in English. STAR works well: situation, task, action, result.]',
  pt: '[Escreva sua melhor resposta em português. STAR funciona bem: situação, tarefa, ação, resultado.]',
}

type AiState = { target: string; changes: string[]; previous: string } | { target: string; error: string; retry: () => void } | null

const TEXTAREA =
  'w-full resize-y rounded-lg border border-[var(--border-strong)] px-3.5 py-3 text-[14px] leading-[1.6] placeholder:text-[#6b7180] focus:border-[var(--indigo)] focus:outline-none'


type GeneralistProps = {
  questionId: string
  lang: Lang
  answer: string
  onAnswer: (text: string) => void
  aiReady: boolean
  /** Saves everything pending first, so the AI reads what is on screen. */
  flushAll: () => void
}

export function GeneralistSection({ questionId, lang, answer, onAnswer, aiReady, flushAll }: GeneralistProps) {
  const [ai, setAi] = useState<AiState>(null)
  const [drafting, start] = useTransition()

  const draft = () => {
    flushAll()
    const previous = answer
    start(async () => {
      const res = await draftAnswer({ questionId, jobId: null, lang })
      if (!res.ok) {
        setAi({ target: questionId, error: res.error, retry: draft })
        return
      }
      setAi({ target: questionId, changes: res.data.changes, previous })
      onAnswer(res.data.text)
    })
  }

  return (
    <section aria-labelledby="g-h" className="flex flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="g-h" className="m-0 text-[16px] font-semibold">
          Your generalist answer <span className="font-medium text-[var(--muted)]">· {langLabel(lang)}</span>
        </h2>
        <button type="button" className="btn-s min-h-9 rounded-lg px-3 text-[13px]" onClick={draft} disabled={drafting || !aiReady} title={aiReady ? undefined : NOT_READY}>
          <Icon name="sparkle" />
          {drafting ? 'Drafting…' : 'Draft from my blocks'}
        </button>
      </div>
      {drafting && (
        <p role="status" className="m-0 text-[12.5px] text-[var(--indigo-hover)]">
          The AI is reading your blocks and Experiences notes…
        </p>
      )}
      {ai && 'changes' in ai && (
        <AiChanges
          changes={ai.changes}
          onUndo={() => {
            onAnswer(ai.previous)
            setAi(null)
          }}
          onDismiss={() => setAi(null)}
        />
      )}
      {ai && 'error' in ai && <AiError message={ai.error} onRetry={ai.retry} />}
      <label htmlFor="gen-a" className="sr-only">
        Generalist answer
      </label>
      <textarea
        id="gen-a"
        lang={htmlLang(lang)}
        rows={8}
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        placeholder={GENERALIST_PLACEHOLDER[lang]}
        className={TEXTAREA}
      />
    </section>
  )
}

type TailoredProps = {
  questionId: string
  lang: Lang
  jobs: JobOption[]
  jobId: string | null
  onJob: (jobId: string) => void
  text: string
  onText: (text: string) => void
  aiReady: boolean
  flushAll: () => void
}

export function TailoredSection({ questionId, lang, jobs, jobId, onJob, text, onText, aiReady, flushAll }: TailoredProps) {
  const [ai, setAi] = useState<AiState>(null)
  const [request, setRequest] = useState('')
  const [working, start] = useTransition()
  const target = `${questionId}|${jobId}|${lang}`
  const shown = ai && ai.target === target ? ai : null

  const run = (instruction: string | null) => {
    if (!jobId) return
    flushAll()
    const previous = text
    start(async () => {
      const res = instruction
        ? await reviseAnswer({ questionId, jobId, lang, current: previous, instruction })
        : await draftAnswer({ questionId, jobId, lang })
      if (!res.ok) {
        setAi({ target, error: res.error, retry: () => run(instruction) })
        return
      }
      setAi({ target, changes: res.data.changes, previous })
      onText(res.data.text)
      if (instruction) setRequest('')
    })
  }

  if (!jobs.length) {
    return (
      <section aria-labelledby="t-h" className="flex flex-col gap-3 rounded-xl border border-[var(--indigo-line)] bg-white p-5">
        <h2 id="t-h" className="m-0 text-[16px] font-semibold">
          Adapt it to a job
        </h2>
        <p className="m-0 rounded-[10px] border border-dashed border-[var(--border-strong)] p-5 text-center text-[14px] text-[var(--muted)]">
          No jobs yet. Add one in <Link href="/analyze">Job analysis</Link>, then adapt your answer to it here.
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="t-h" className="flex flex-col gap-3 rounded-xl border border-[var(--indigo-line)] bg-white p-5 shadow-[0_4px_16px_rgba(20,22,27,0.05)]">
      <h2 id="t-h" className="m-0 text-[16px] font-semibold">
        Adapt it to a job
      </h2>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-[1_1_260px] flex-col gap-1.5">
          <label htmlFor="job-sel" className="text-[12px] font-medium text-[var(--muted)]">
            Job you are applying to
          </label>
          <select
            id="job-sel"
            value={jobId ?? ''}
            onChange={(e) => onJob(e.target.value)}
            className="min-h-11 rounded-lg border border-[var(--border-strong)] bg-white px-2.5 text-[14px]"
          >
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-p min-h-11 rounded-lg px-[18px] text-[14px]" onClick={() => run(null)} disabled={working || !aiReady} title={aiReady ? undefined : NOT_READY}>
          <Icon name="sparkle" size={16} />
          {working ? 'Writing…' : text.trim() ? 'Regenerate' : 'Generate answer'}
        </button>
      </div>
      {working && (
        <p role="status" className="m-0 text-[12.5px] text-[var(--indigo-hover)]">
          The AI is adapting your answer to this job…
        </p>
      )}
      {shown && 'changes' in shown && (
        <AiChanges
          changes={shown.changes}
          onUndo={() => {
            onText(shown.previous)
            setAi(null)
          }}
          onDismiss={() => setAi(null)}
        />
      )}
      {shown && 'error' in shown && <AiError message={shown.error} onRetry={shown.retry} />}
      {text.trim() || (shown && 'changes' in shown) ? (
        <div className="flex flex-col gap-2.5">
          <label htmlFor="tail-a" className="sr-only">
            Answer adapted to the selected job
          </label>
          <textarea id="tail-a" lang={htmlLang(lang)} rows={8} value={text} onChange={(e) => onText(e.target.value)} className={TEXTAREA} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (request.trim()) run(request.trim())
            }}
          >
            <label htmlFor="t-refine" className="sr-only">
              Ask for changes
            </label>
            <input
              id="t-refine"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder="Ask for changes, e.g. shorter, under 90 seconds spoken"
              className="min-h-11 min-w-0 flex-auto rounded-lg border border-[var(--border-strong)] px-3 text-[14px] placeholder:text-[#6b7180]"
            />
            <button
              type="submit"
              aria-label="Send change request"
              disabled={!request.trim() || working || !aiReady}
              className="btn-s h-11 w-11 flex-none justify-center rounded-lg p-0"
            >
              <Icon name="send" size={18} />
            </button>
          </form>
        </div>
      ) : (
        <p className="m-0 rounded-[10px] border border-dashed border-[var(--border-strong)] p-5 text-center text-[14px] text-[var(--muted)]">
          No version for this job in {langLabel(lang)} yet.
        </p>
      )}
    </section>
  )
}

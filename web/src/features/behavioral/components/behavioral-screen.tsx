'use client'

// Behavioral → Interview answers. The screen keeps its own copy of what you type and autosaves it;
// the job you pick goes into the link so Interview mode opens on the same job.
import { useState } from 'react'
import { SaveStatus } from '@/features/ai/ui/save-status'
import { useAutosave, type SaveStatus as Status } from '@/features/ai/ui/use-autosave'
import { saveAnswer, saveTailored, saveTheory, setUseFounder } from '../actions'
import { behavioralQuery, LANGS, tailoredKey, type BehavioralData, type Lang } from '../types'
import { GeneralistSection, TailoredSection } from './answer-sections'
import { BehavioralPills, LangSwitch } from './behavioral-pills'
import { DeleteQuestion } from './delete-question'
import { QuestionList } from './question-list'
import { FounderSection, MyTheorySection } from './theory-sections'

type Theory = { theory: string; references: string[] }
type AnswerSave = { questionId: string; lang: Lang; answer: string }
type TheorySave = Theory & { questionId: string }
type TailoredSave = { questionId: string; jobId: string; lang: Lang; text: string }

const sameQuestion = (a: { questionId: string }, b: { questionId: string }) => a.questionId === b.questionId
const sameAnswer = (a: AnswerSave, b: AnswerSave) => a.questionId === b.questionId && a.lang === b.lang
const sameTailored = (a: TailoredSave, b: TailoredSave) => a.questionId === b.questionId && a.jobId === b.jobId && a.lang === b.lang
/** The generalist answers on screen, one per question and language. */
const answerKey = (questionId: string, lang: Lang) => `${questionId}|${lang}`

/** One status for all autosaves on the screen: an error wins, then saving, then saved. */
function combined(saves: { status: Status; error: string | null }[]): { status: Status; error: string | null } {
  const failed = saves.find((s) => s.status === 'error')
  if (failed) return failed
  if (saves.some((s) => s.status === 'saving')) return { status: 'saving', error: null }
  if (saves.some((s) => s.status === 'saved')) return { status: 'saved', error: null }
  return { status: 'idle', error: null }
}

type Props = { data: BehavioralData; initialJobId: string | null; initialLang: Lang; aiReady: boolean }

export function BehavioralScreen({ data, initialJobId, initialLang, aiReady }: Props) {
  const { questions, jobs } = data
  const [selectedId, setSelectedId] = useState(questions[0]?.id ?? '')
  const [jobId, setJobId] = useState(initialJobId)
  const [lang, setLang] = useState<Lang>(initialLang)
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.flatMap((q) => LANGS.map((l) => [answerKey(q.id, l.id), q.answers[l.id]]))),
  )
  const [theories, setTheories] = useState<Record<string, Theory>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, { theory: q.theory, references: q.references }])),
  )
  const [useFounder, setUseFounderState] = useState<Record<string, boolean>>(() => Object.fromEntries(questions.map((q) => [q.id, q.useFounder])))
  const [founderError, setFounderError] = useState<string | null>(null)
  const [tailored, setTailored] = useState(data.tailored)

  const answerSave = useAutosave<AnswerSave>(saveAnswer, { sameTarget: sameAnswer })
  const theorySave = useAutosave<TheorySave>(saveTheory, { sameTarget: sameQuestion })
  const tailoredSave = useAutosave<TailoredSave>(saveTailored, { sameTarget: sameTailored })
  const status = combined([answerSave, theorySave, tailoredSave])

  const question = questions.find((q) => q.id === selectedId) ?? questions[0]
  if (!question) return <p className="m-0 text-[14px] text-[var(--muted)]">No behavioral questions yet.</p>

  const flushAll = () => {
    answerSave.flush()
    theorySave.flush()
    tailoredSave.flush()
  }

  const setAnswer = (text: string) => {
    setAnswers((all) => ({ ...all, [answerKey(question.id, lang)]: text }))
    answerSave.queue({ questionId: question.id, lang, answer: text })
  }

  const setTheory = (next: Theory) => {
    setTheories((all) => ({ ...all, [question.id]: next }))
    theorySave.queue({ questionId: question.id, ...next })
  }

  const setTailoredText = (text: string) => {
    if (!jobId) return
    setTailored((all) => ({ ...all, [tailoredKey(question.id, jobId, lang)]: text }))
    tailoredSave.queue({ questionId: question.id, jobId, lang, text })
  }

  const toggleFounder = async (next: boolean) => {
    const id = question.id
    setFounderError(null)
    setUseFounderState((all) => ({ ...all, [id]: next }))
    const res = await setUseFounder({ questionId: id, useFounder: next })
    if (!res.ok) {
      setUseFounderState((all) => ({ ...all, [id]: !next }))
      setFounderError(res.error)
    }
  }

  const chooseJob = (id: string) => {
    tailoredSave.flush()
    setJobId(id)
    window.history.replaceState(null, '', `/behavioral${behavioralQuery(id, lang)}`)
  }

  // Switching language shows that language's answers (empty until you write them); nothing is translated.
  const chooseLang = (next: Lang) => {
    flushAll()
    setLang(next)
    window.history.replaceState(null, '', `/behavioral${behavioralQuery(jobId, next)}`)
  }

  const select = (id: string) => {
    flushAll()
    setFounderError(null)
    setSelectedId(id)
  }

  // After deleting, the question before it is shown (or the next one when it was the first).
  const afterDelete = () => {
    const at = questions.findIndex((q) => q.id === question.id)
    const next = questions[at - 1] ?? questions[at + 1]
    setSelectedId(next?.id ?? '')
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-3.5 pb-14 pt-[18px]">
      <header className="flex flex-col gap-1.5">
        <p className="eyebrow text-[12px]">BEHAVIORAL</p>
        <h1 className="sr-only">Interview answers</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <BehavioralPills current="answers" jobId={jobId} lang={lang} />
          <LangSwitch lang={lang} onChange={chooseLang} />
        </div>
        {/* Its line is always there, so "Saving…" appearing never pushes the page down. */}
        <SaveStatus status={status.status} error={status.error} className="block min-h-[18px] text-[12px]" />
        <p className="m-0 max-w-[660px] text-[14px] leading-[1.5] text-[var(--muted)]">
          Keep one generalist answer per question, then let the AI adapt it to each job. Your own notes on how to answer live at the bottom.
        </p>
      </header>

      <div className="flex flex-wrap items-start gap-4">
        <QuestionList
          questions={questions}
          answerOf={(id) => answers[answerKey(id, lang)] ?? ''}
          lang={lang}
          tailored={tailored}
          selectedId={question.id}
          onSelect={select}
          onAdded={select}
        />

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <section className="flex flex-col gap-3.5 rounded-xl border border-[var(--border)] bg-white p-5">
            <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
              <p className="m-0 font-mono text-[12px] text-[var(--muted)]">
                Question {question.n}
                {question.custom && ' · added by you'}
              </p>
              {question.custom && <DeleteQuestion key={question.id} questionId={question.id} onDeleted={afterDelete} />}
            </div>
            <h2 lang="pt-BR" className="m-0 text-[19px] font-semibold leading-[1.4] tracking-[-0.01em]">
              {question.full}
            </h2>
            {question.looksFor.length > 0 && (
              <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--amber-line)] bg-[var(--amber-soft)] p-3.5">
                <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold text-[var(--amber-ink)]">What interviewers look for here</h3>
                <ul lang="pt-BR" className="m-0 flex list-disc flex-col gap-1 pl-[18px] text-[13px] leading-[1.5] text-[var(--amber-ink)]">
                  {question.looksFor.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <GeneralistSection
            key={`${question.id}-${lang}`}
            questionId={question.id}
            lang={lang}
            answer={answers[answerKey(question.id, lang)] ?? ''}
            onAnswer={setAnswer}
            aiReady={aiReady}
            flushAll={flushAll}
          />

          <TailoredSection
            key={`t-${question.id}-${lang}`}
            questionId={question.id}
            lang={lang}
            jobs={jobs}
            jobId={jobId}
            onJob={chooseJob}
            text={jobId ? (tailored[tailoredKey(question.id, jobId, lang)] ?? '') : ''}
            onText={setTailoredText}
            aiReady={aiReady}
            flushAll={flushAll}
          />

          <FounderSection question={question} useFounder={useFounder[question.id] ?? true} onToggle={toggleFounder} error={founderError} />

          <MyTheorySection key={`m-${question.id}`} question={question} value={theories[question.id] ?? { theory: '', references: [] }} onChange={setTheory} />
        </div>
      </div>
    </div>
  )
}

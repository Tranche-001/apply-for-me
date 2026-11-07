'use client'

// Job analysis: pick or create the job → read its posting (or paste it) → the AI compares it with your
// blocks, asks about gaps and drafts versions → you keep, edit or discard → Save stores what you kept.
// The analysis itself lives on this screen until you save; nothing is written before Save.
import { useState, useTransition } from 'react'
import { analyzeJob } from '@/features/ai/actions'
import type { DraftVersion, JobAnalysis } from '@/features/ai/types'
import { AiError } from '@/features/ai/ui/ai-changes'
import { bulletsToSave } from '@/features/ai/ui/draft-fields'
import { addAnswersToExperiences } from '@/features/experiences/actions'
import { ANSWERS_TITLE } from '@/features/experiences/types'
import { createJob, readPosting, renameJob, saveAnalysisDrafts, savePostingText } from '../actions'
import {
  answersToFile,
  currentStep,
  destinationOf,
  parseUrls,
  toSave,
  type ExperienceOption,
  type FiledAnswer,
  type JobSummary,
  type MadeDraft,
  type Phase,
  type ReadResult,
} from '../types'
import { JobBar } from './job-bar'
import { MadePanel } from './made-panel'
import { QuestionsPanel } from './questions-panel'
import { ReadStatus } from './read-status'
import { RequirementsPanel } from './requirements-panel'
import { Steps } from './steps'

function toDraftVersion(m: MadeDraft): DraftVersion {
  return { blockId: m.blockId, newBlock: m.newBlock, name: m.name, title: m.title.trim(), bullets: bulletsToSave(m.bullets), waitingOn: m.waitingOn }
}

const WORKING: Partial<Record<Phase, string>> = {
  reading: 'Reading the posting (up to 10 seconds per link)…',
  analyzing: 'The AI is comparing the posting with your blocks. This takes a minute or two.',
  saving: 'Saving what you kept…',
}

type Props = { initialJobs: JobSummary[]; initialJobId: string | null; experiences: ExperienceOption[]; aiReady: boolean }

export function AnalyzeScreen({ initialJobs, initialJobId, experiences: initialExperiences, aiReady }: Props) {
  const [jobs, setJobs] = useState(initialJobs)
  const [jobId, setJobId] = useState(initialJobId)
  const [urlInput, setUrlInput] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [redrafting, setRedrafting] = useState(false)
  const [pending, startBusy] = useTransition()
  const [error, setError] = useState<{ message: string; retry: (() => void) | null } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [readResults, setReadResults] = useState<ReadResult[] | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null)
  const [made, setMade] = useState<MadeDraft[] | null>(null)
  const [discarded, setDiscarded] = useState<{ draft: MadeDraft; index: number } | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [noAnswer, setNoAnswer] = useState<Record<string, boolean>>({})
  const [experiences, setExperiences] = useState(initialExperiences)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [filed, setFiled] = useState<Record<string, FiledAnswer>>({})
  const [fileError, setFileError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const job = jobs.find((j) => j.id === jobId) ?? null
  const busy = pending || phase !== 'idle'
  const asks = analysis?.asks ?? []
  const openAsks = asks.filter((a) => !(answers[a.id] ?? '').trim() && !noAnswer[a.id]).length
  const answersPlaceId = experiences.find((e) => e.title === ANSWERS_TITLE)?.id ?? ''

  /** New questions: forget the answers given to the previous ones and where they went. */
  const clearAnswers = () => {
    setAnswers({})
    setNoAnswer({})
    setPicked({})
    setFiled({})
    setFileError(null)
  }

  const resetAnalysis = () => {
    setAnalysis(null)
    setMade(null)
    setDiscarded(null)
    clearAnswers()
    setReadResults(null)
    setPasteOpen(false)
    setSaved(null)
    setSaveError(null)
    setError(null)
  }

  const pickJob = (id: string) => {
    if (id === jobId) return
    const unsaved = made ? toSave(made).length : 0
    if (unsaved && !window.confirm(`Leave ${unsaved} kept ${unsaved === 1 ? 'draft' : 'drafts'} for ${job?.label ?? 'this job'} unsaved?`)) return
    setJobId(id)
    setNotice(null)
    resetAnalysis()
    window.history.replaceState(null, '', `?job=${encodeURIComponent(id)}`)
  }

  /**
   * Long work runs in the busy transition, but its status line (and the step it lights) is set first,
   * outside it: React holds back state set inside a transition before its first await until the whole
   * action ends, so a status set there would only show once the work is already done.
   */
  const busyWith = (status: Phase, work: () => Promise<void>, redraft = false) => {
    setPhase(status)
    setRedrafting(redraft)
    startBusy(work)
  }

  const runAnalysis = async (target: JobSummary, opts: { redraft: boolean; instruction?: string }) => {
    setPhase('analyzing')
    setRedrafting(opts.redraft)
    setError(null)
    const res = await analyzeJob({
      jobId: target.id,
      answers: opts.redraft ? asks.map((a) => ({ id: a.id, question: a.text, answer: noAnswer[a.id] ? null : (answers[a.id] ?? '') })) : [],
      instruction: opts.instruction ?? null,
      previousDrafts: opts.instruction
        ? (made ?? []).map((m) => ({ blockName: m.blockName, title: m.title, bullets: m.bullets.map((b) => b.text).filter(Boolean) }))
        : [],
    })
    setPhase('idle')
    if (!res.ok) {
      setError({ message: res.error, retry: () => busyWith('analyzing', () => runAnalysis(target, opts), opts.redraft) })
      return
    }
    setAnalysis(res.data)
    setMade(res.data.drafts.map((d) => ({ ...d, keep: true, editing: false })))
    setDiscarded(null)
    setSaved(null)
    setSaveError(null)
  }

  /**
   * Adds the answers you just gave to Experiences, each at the end of the experience it is about.
   * A failure is shown under the questions but does not stop the drafts: the AI still gets the answers.
   */
  const fileAnswers = async (target: JobSummary) => {
    const pending = answersToFile(asks, answers, noAnswer, filed)
    if (!pending.length) return
    setFileError(null)
    const res = await addAnswersToExperiences({
      jobId: target.id,
      items: pending.map(({ ask, answer }) => ({ question: ask.text, answer, experienceId: destinationOf(ask, picked, answersPlaceId) || null })),
    })
    if (!res.ok) {
      setFileError(`Couldn’t add your answers to Experiences: ${res.error}`)
      return
    }
    setFiled((all) => ({ ...all, ...Object.fromEntries(pending.map(({ ask, answer }, i) => [ask.id, { answer, ...res.data[i] }])) }))
    setExperiences((all) => {
      const created = res.data.filter((p, i, list) => !all.some((e) => e.id === p.experienceId) && list.findIndex((q) => q.experienceId === p.experienceId) === i)
      return created.length ? [...all, ...created.map((p) => ({ id: p.experienceId, title: p.title }))] : all
    })
  }

  const onAnalyze = () => {
    if (!job) return
    const urls = parseUrls(urlInput)
    const hasPostingLinks = job.links.some((l) => l.kind === 'POSTING' || l.kind === 'APPLICATION')
    const needsRead = urls.length > 0 || (!job.postingChars && hasPostingLinks)
    setNotice(null)
    if (!needsRead && !job.postingChars) {
      setError({ message: 'Add a link to the job posting, or paste the job text.', retry: null })
      setPasteOpen(true)
      return
    }
    setError(null)
    busyWith(needsRead ? 'reading' : 'analyzing', async () => {
      if (needsRead) {
        const read = await readPosting({ jobId: job.id, urls })
        if (!read.ok) {
          setPhase('idle')
          setError({ message: read.error, retry: null })
          return
        }
        setJobs((all) => all.map((j) => (j.id === read.data.job.id ? read.data.job : j)))
        setReadResults(read.data.results)
        setUrlInput('')
        if (!read.data.results.some((r) => r.ok)) {
          setPhase('idle')
          setPasteOpen(true)
          return
        }
      }
      clearAnswers()
      await runAnalysis(job, { redraft: false })
    })
  }

  const onUsePasted = async (text: string): Promise<string | null> => {
    if (!job) return null
    setPhase('reading')
    const res = await savePostingText({ jobId: job.id, text })
    if (!res.ok) {
      setPhase('idle')
      return res.error
    }
    setJobs((all) => all.map((j) => (j.id === job.id ? { ...j, postingChars: res.data.postingChars } : j)))
    setPasteOpen(false)
    clearAnswers()
    busyWith('analyzing', () => runAnalysis({ ...job, postingChars: res.data.postingChars }, { redraft: false }))
    return null
  }

  const onCreateJob = async (company: string, role: string): Promise<string | null> => {
    const res = await createJob({ company, role })
    if (!res.ok) return res.error
    const created = res.data.job
    setJobs((all) => (all.some((j) => j.id === created.id) ? all : [created, ...all]))
    pickJob(created.id)
    if (res.data.existed) setNotice(`You already had “${created.label}”, so it is open now.`)
    return null
  }

  const onRename = async (company: string, role: string): Promise<string | null> => {
    if (!job) return null
    const res = await renameJob({ jobId: job.id, company, role })
    if (!res.ok) return res.error
    const label = res.data.label
    setJobs((all) => all.map((j) => (j.id === job.id ? { ...j, company: company.trim(), role: role.trim(), label } : j)))
    setMade((all) => all?.map((m) => (m.blockId ? { ...m, name: label } : m)) ?? null)
    return null
  }

  const onSave = () => {
    if (!job || !made) return
    const kept = toSave(made)
    busyWith('saving', async () => {
      setSaveError(null)
      const res = await saveAnalysisDrafts({ jobId: job.id, drafts: kept.map(toDraftVersion) })
      setPhase('idle')
      if (!res.ok) {
        setSaveError(res.error)
        return
      }
      const keys = new Set(kept.map((k) => k.key))
      setMade((all) => all?.filter((m) => !keys.has(m.key)) ?? null)
      setDiscarded(null)
      const n = res.data.saved.length
      setSaved(`Saved ${n} to your library, linked to ${job.label}. Open its CV to use ${n === 1 ? 'it' : 'them'}.`)
    })
  }

  const step = currentStep({ phase, analysis, openAsks, saved: Boolean(saved), redrafting })

  return (
    <div className="flex flex-col gap-2.5 pb-2">
      <JobBar
        jobs={jobs}
        job={job}
        onPickJob={pickJob}
        onCreateJob={onCreateJob}
        urlInput={urlInput}
        onUrlInput={setUrlInput}
        onAnalyze={onAnalyze}
        busy={busy}
        aiReady={aiReady}
      />
      <Steps current={step} />
      <div aria-live="polite" className="flex flex-col gap-1.5">
        {WORKING[phase] && <p className="m-0 text-[12.5px] text-[var(--indigo-hover)]">{WORKING[phase]}</p>}
        {notice && <p className="m-0 text-[12.5px] text-[var(--text-2)]">{notice}</p>}
      </div>
      {error && <AiError message={error.message} onRetry={error.retry ?? undefined} />}
      {job && (
        <ReadStatus
          key={job.id}
          results={readResults}
          pasteOpen={pasteOpen}
          onOpenPaste={() => setPasteOpen(true)}
          onClosePaste={() => setPasteOpen(false)}
          onUsePasted={onUsePasted}
          busy={busy}
        />
      )}

      {job ? (
        <div className="flex min-h-0 flex-auto flex-wrap items-stretch gap-3">
          <RequirementsPanel key={job.id} job={job} requirements={analysis?.requirements ?? null} onRename={onRename} />
          <QuestionsPanel
            asks={analysis ? asks : null}
            answers={answers}
            noAnswer={noAnswer}
            onAnswer={(id, text) => setAnswers((all) => ({ ...all, [id]: text }))}
            onToggleNoAnswer={(id) => setNoAnswer((all) => ({ ...all, [id]: !all[id] }))}
            onRedraft={() =>
              busyWith(
                'analyzing',
                async () => {
                  await fileAnswers(job)
                  await runAnalysis(job, { redraft: true })
                },
                true,
              )
            }
            busy={busy || !aiReady}
            experiences={experiences}
            destination={(ask) => destinationOf(ask, picked, answersPlaceId)}
            onDestination={(id, experienceId) => setPicked((all) => ({ ...all, [id]: experienceId }))}
            filed={filed}
            fileError={fileError}
          />
          <MadePanel
            jobId={job.id}
            made={made}
            asks={asks}
            reused={analysis?.reused ?? []}
            notes={(analysis?.report ?? []).filter((r) => r.tag === 'NOTE' || r.tag === 'LEFT OUT')}
            onChange={(key, patch) => setMade((all) => all?.map((m) => (m.key === key ? { ...m, ...patch } : m)) ?? null)}
            onDiscard={(key) => {
              const index = made?.findIndex((m) => m.key === key) ?? -1
              if (!made || index < 0) return
              setDiscarded({ draft: made[index], index })
              setMade(made.filter((m) => m.key !== key))
            }}
            onUndoDiscard={
              discarded
                ? () => {
                    setMade((all) => {
                      const list = [...(all ?? [])]
                      list.splice(discarded.index, 0, discarded.draft)
                      return list
                    })
                    setDiscarded(null)
                  }
                : null
            }
            onRefine={(instruction) => busyWith('analyzing', () => runAnalysis(job, { redraft: true, instruction }), true)}
            onSave={onSave}
            savedText={saved}
            saveError={saveError}
            busy={busy || !aiReady}
          />
        </div>
      ) : (
        <div className="card flex max-w-[520px] flex-col gap-2 p-4">
          <p className="m-0 text-[14px] font-semibold">No jobs yet</p>
          <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--muted)]">Press “New job”, give it a company and a role, then paste the link to its posting.</p>
        </div>
      )}
    </div>
  )
}

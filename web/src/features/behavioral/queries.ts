import 'server-only'
import { db } from '@/lib/db'
import { jobLabel } from '../ai/labels'
import { fromDbLang, isCustomKey, tailoredKey, type BehavioralData } from './types'

export async function loadBehavioral(): Promise<BehavioralData> {
  const [questions, tailored, jobs] = await Promise.all([
    db.behavioralQuestion.findMany({ orderBy: { position: 'asc' } }),
    db.tailoredAnswer.findMany({ select: { questionId: true, jobId: true, lang: true, text: true } }),
    db.job.findMany({ orderBy: [{ updatedAt: 'desc' }], select: { id: true, company: true, role: true } }),
  ])
  return {
    questions: questions.map((q, i) => ({
      id: q.id,
      key: q.key,
      n: String(i + 1).padStart(2, '0'),
      short: q.short,
      full: q.full,
      looksFor: q.looksFor,
      answers: { en: q.answer, pt: q.answerPt },
      theory: q.theory,
      references: q.references,
      useFounder: q.useFounder,
      founderNotes: q.founderNotes,
      founderRefs: q.founderRefs,
      custom: isCustomKey(q.key),
    })),
    tailored: Object.fromEntries(tailored.map((t) => [tailoredKey(t.questionId, t.jobId, fromDbLang(t.lang)), t.text])),
    jobs: jobs.map((j) => ({ id: j.id, label: jobLabel(j), company: j.company.trim() || j.role.trim() })),
  }
}

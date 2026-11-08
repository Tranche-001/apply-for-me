'use client'

// REVIEW after the CV appears: "Make a new CV" asks the AI for the After CV (kept in the session until you keep one),
// Before / After shows either CV, Keep Before / Keep After commits one. With "Remember this for next CVs", Keep After
// also saves your request as rules learned from use (the moment you said the new CV is what you want).
import { useState } from 'react'
import { learnRulesFromReview, reviewCv } from '../../ai/review-actions'
import { keepAfter, keepBefore, keptLine, withReview } from '../cv-review'
import type { Analysis } from './use-analysis'

export type ReviewShow = 'before' | 'after'
export type ReviewProblem = { message: string; retry: () => void }

const OFFLINE = 'Couldn’t reach the app. Check that it is running, then try again.'
const READY = '✓ New CV ready. Compare Before and After, then keep one.'

export function useCvReview(a: Pick<Analysis, 'job' | 'session' | 'change'>) {
  const [busy, setBusy] = useState<'making' | 'learning' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<ReviewProblem | null>(null)
  const [showing, setShowing] = useState<ReviewShow>('after')

  const failed = (message: string, retry: () => void) => {
    setBusy(null)
    setStatus(null)
    setProblem({ message, retry })
  }

  async function make(request: string, remember: boolean): Promise<void> {
    const s = a.session
    const j = a.job
    if (!s || !j || !request.trim()) return
    setBusy('making')
    setProblem(null)
    setStatus('Making a new CV…')
    try {
      // The CV now goes without any earlier After CV: the new one replaces it.
      const res = await reviewCv({ jobId: j.id, request, remember, session: keepBefore(s) })
      if (!res.ok) return failed(res.error, () => void make(request, remember))
      a.change((cur) => withReview(keepBefore(cur), res.data))
      setShowing('after')
      setStatus(READY)
      setBusy(null)
    } catch {
      failed(OFFLINE, () => void make(request, remember))
    }
  }

  async function learn(request: string): Promise<void> {
    const j = a.job
    if (!j) return
    setBusy('learning')
    setProblem(null)
    setStatus('Kept After. Saving your request as rules…')
    try {
      const res = await learnRulesFromReview({ jobId: j.id, request })
      if (!res.ok) return failed(`Kept After, but your request couldn’t be saved as rules: ${res.error}`, () => void learn(request))
      setStatus(keptLine('after', { added: res.data.added.length, already: res.data.already }))
      setBusy(null)
    } catch {
      failed(`Kept After, but your request couldn’t be saved as rules: ${OFFLINE}`, () => void learn(request))
    }
  }

  function keep(which: ReviewShow): void {
    const review = a.session?.review
    if (!review) return
    setProblem(null)
    setShowing('after')
    if (which === 'before') {
      a.change(keepBefore)
      setStatus(keptLine('before'))
      return
    }
    a.change(keepAfter)
    if (review.remember) void learn(review.request)
    else setStatus(keptLine('after'))
  }

  return { busy, status, problem, showing, setShowing, make: (request: string, remember: boolean) => void make(request, remember), keep }
}

export type CvReviewState = ReturnType<typeof useCvReview>

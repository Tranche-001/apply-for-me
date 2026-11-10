import { connection } from 'next/server'
import { NOT_READY } from '@/features/ai/provider'
import { aiReady as isAiReady } from '@/features/ai/settings'
import { Suspense } from 'react'
import { AnalyzeScreen } from '@/features/analysis/components/analyze-screen'
import { listExperienceOptions, loadAnalysisJob } from '@/features/analysis/queries'
import { getLibrary } from '@/features/blocks/queries'
import { getProfile } from '@/features/profile/queries'

export const metadata = { title: 'Turn a job posting into blocks' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Analyze searchParams={searchParams} />
    </Suspense>
  )
}

async function Analyze({ searchParams }: Props) {
  await connection() // request time only: the build never queries the database
  const params = await searchParams
  const wanted = typeof params.job === 'string' ? params.job : null
  // ?job=<id> resumes that job's saved analysis (a reload, or "Analyze again" on Jobs); no job = start from a link.
  const [experiences, library, profile, loaded] = await Promise.all([listExperienceOptions(), getLibrary(), getProfile(), wanted ? loadAnalysisJob(wanted) : null])
  const aiReady = await isAiReady()
  return (
    // No key: a refresh() after a write re-renders this page with ?job=, and the screen must keep its state.
    <AnalyzeScreen
      loaded={loaded}
      experiences={experiences}
      library={library}
      profile={profile}
      aiReady={aiReady}
      notReadyText={NOT_READY}
    />
  )
}

function Loading() {
  return (
    <header className="flex flex-col gap-px">
      <p className="eyebrow">JOB ANALYSIS</p>
      <h1 className="page-title">Turn a job posting into blocks</h1>
      <p role="status" className="m-0 text-[12px] text-[var(--muted)]">
        Loading your jobs…
      </p>
    </header>
  )
}

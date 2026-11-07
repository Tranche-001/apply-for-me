import { connection } from 'next/server'
import { aiProvider } from '@/features/ai/provider'
import { Suspense } from 'react'
import { AnalyzeScreen } from '@/features/analysis/components/analyze-screen'
import { listExperienceOptions, listJobsForAnalysis } from '@/features/analysis/queries'
import { pickJob } from '@/features/behavioral/types'

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
  const [jobs, experiences, params] = await Promise.all([listJobsForAnalysis(), listExperienceOptions(), searchParams])
  const wanted = typeof params.job === 'string' ? params.job : null
  const aiReady = aiProvider() !== null
  return <AnalyzeScreen initialJobs={jobs} initialJobId={pickJob(jobs, wanted)} experiences={experiences} aiReady={aiReady} />
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

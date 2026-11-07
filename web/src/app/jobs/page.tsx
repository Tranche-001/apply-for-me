import { Suspense } from 'react'
import { connection } from 'next/server'
import { getLibrary } from '@/features/blocks/queries'
import { JobsView } from '@/features/jobs/components/jobs-view'
import { getBehavioralForJobs, listJobs } from '@/features/jobs/queries'
import { getProfile } from '@/features/profile/queries'

export const metadata = { title: 'Every job and the CV for it' }

async function Jobs({ searchParams }: { searchParams: PageProps<'/jobs'>['searchParams'] }) {
  await connection()
  const [params, jobs, library, profile, behavioral] = await Promise.all([searchParams, listJobs(), getLibrary(), getProfile(), getBehavioralForJobs()])
  const job = typeof params.job === 'string' ? params.job : null
  return <JobsView jobs={jobs} library={library} profile={profile} behavioral={behavioral} initialJobId={job} />
}

export default function Page(props: PageProps<'/jobs'>) {
  return (
    <Suspense fallback={<p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Loading your jobs…</p>}>
      <Jobs searchParams={props.searchParams} />
    </Suspense>
  )
}

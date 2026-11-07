import { Suspense } from 'react'
import { connection } from 'next/server'
import { getLibrary } from '@/features/blocks/queries'
import { ComposeView } from '@/features/cv/components/compose-view'
import { listJobs } from '@/features/jobs/queries'
import { getProfile } from '@/features/profile/queries'

export const metadata = { title: 'Build a CV block by block' }

async function Compose({ searchParams }: { searchParams: PageProps<'/compose'>['searchParams'] }) {
  await connection()
  const [params, jobs, library, profile] = await Promise.all([searchParams, listJobs(), getLibrary(), getProfile()])
  const job = typeof params.job === 'string' ? params.job : null
  return <ComposeView jobs={jobs} library={library} profile={profile} initialJobId={job} />
}

/** Compose CV; `/compose?job=<jobId>` opens that job's CV. */
export default function Page(props: PageProps<'/compose'>) {
  return (
    <Suspense fallback={<p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Loading your CV…</p>}>
      <Compose searchParams={props.searchParams} />
    </Suspense>
  )
}

import { Suspense } from 'react'
import { connection } from 'next/server'
import { LibraryView } from '@/features/blocks/components/library-view'
import { getLibrary } from '@/features/blocks/queries'
import { listJobs } from '@/features/jobs/queries'

export const metadata = { title: 'Your blocks' }

async function Library() {
  await connection()
  const [library, jobs] = await Promise.all([getLibrary(), listJobs()])
  return <LibraryView library={library} jobs={jobs.map((j) => ({ id: j.id, label: j.label }))} />
}

export default function Page() {
  return (
    <Suspense fallback={<p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Loading your blocks…</p>}>
      <Library />
    </Suspense>
  )
}

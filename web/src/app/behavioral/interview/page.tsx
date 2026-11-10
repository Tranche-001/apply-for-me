import { connection } from 'next/server'
import { Suspense } from 'react'
import { InterviewScreen } from '@/features/behavioral/components/interview-screen'
import { loadBehavioral } from '@/features/behavioral/queries'
import { pickJob, pickLang } from '@/features/behavioral/types'

export const metadata = { title: 'Interview mode' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Interview searchParams={searchParams} />
    </Suspense>
  )
}

async function Interview({ searchParams }: Props) {
  await connection() // request time only: the build never queries the database
  const [data, params] = await Promise.all([loadBehavioral(), searchParams])
  const wanted = typeof params.job === 'string' ? params.job : null
  const lang = pickLang(typeof params.lang === 'string' ? params.lang : null)
  return <InterviewScreen data={data} initialJobId={pickJob(data.jobs, wanted)} initialLang={lang} />
}

function Loading() {
  return (
    <header className="mx-auto flex max-w-[1180px] flex-col gap-1.5 px-3.5 pt-[18px]">
      <p className="eyebrow text-[12px]">BEHAVIORAL</p>
      <h1 className="page-title">Interview mode</h1>
      <p role="status" className="m-0 text-[13px] text-[var(--muted)]">
        Loading your answers…
      </p>
    </header>
  )
}

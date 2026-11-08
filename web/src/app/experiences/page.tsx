import { connection } from 'next/server'
import { aiProvider } from '@/features/ai/provider'
import { Suspense } from 'react'
import { ExperiencesScreen } from '@/features/experiences/components/experiences-screen'
import { readPairingNeeds } from '@/features/experiences/pairing'
import { listExperiences } from '@/features/experiences/queries'

export const metadata = { title: 'Everything you did, in your own words' }

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default function Page({ searchParams }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Experiences searchParams={searchParams} />
    </Suspense>
  )
}

async function Experiences({ searchParams }: Props) {
  await connection() // request time only: the build never queries the database
  const [items, needs, params] = await Promise.all([listExperiences(), readPairingNeeds(), searchParams])
  // ?open=<id>: the experience to show first (Job analysis links here after adding an answer).
  const open = typeof params.open === 'string' && items.some((e) => e.id === params.open) ? params.open : null
  // The key stays on the server; the screen only learns whether the AI can run.
  const aiReady = aiProvider() !== null
  return <ExperiencesScreen initialItems={items} initialSelectedId={open} aiReady={aiReady} initialNeeds={needs} />
}

function Loading() {
  return (
    <header className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <p className="eyebrow">EXPERIENCES</p>
        <h1 className="page-title">Everything you did, in your own words</h1>
      </div>
      <p role="status" className="m-0 text-[12px] text-[var(--muted)]">
        Loading your experiences…
      </p>
    </header>
  )
}

import { connection } from 'next/server'
import { Suspense } from 'react'
import { PreferencesScreen } from '@/features/preferences/components/preferences-screen'
import { listRules } from '@/features/preferences/queries'

export const metadata = { title: 'Your style rules' }

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Preferences />
    </Suspense>
  )
}

async function Preferences() {
  await connection() // request time only: the build never queries the database
  const rules = await listRules()
  return <PreferencesScreen initialRules={rules} />
}

function Loading() {
  return (
    <header className="mx-auto flex max-w-[1180px] flex-col gap-1.5 px-3.5 pt-[18px]">
      <p className="eyebrow text-[12px]">WHAT THE AI LEARNED</p>
      <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">Your style rules</h1>
      <p role="status" className="m-0 text-[13px] text-[var(--muted)]">
        Loading your rules…
      </p>
    </header>
  )
}

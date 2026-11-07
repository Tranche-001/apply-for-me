import { Suspense } from 'react'
import { connection } from 'next/server'
import { ProfilePage } from '@/features/profile/components/profile-page'
import { getProfile } from '@/features/profile/queries'

export const metadata = { title: 'The parts of your CV that aren’t blocks' }

async function ProfileData() {
  await connection()
  const profile = await getProfile()
  return <ProfilePage initial={profile} />
}

export default function Page() {
  return (
    <Suspense fallback={<p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Loading your profile…</p>}>
      <ProfileData />
    </Suspense>
  )
}

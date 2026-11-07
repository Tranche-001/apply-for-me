'use client'

import { ScreenError } from '@/features/ai/ui/screen-error'

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <ScreenError eyebrow="JOB ANALYSIS" title="Turn a job posting into blocks" retry={retry} />
}

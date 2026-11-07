'use client'

import { ScreenError } from '@/features/ai/ui/screen-error'

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <ScreenError eyebrow="EXPERIENCES" title="Everything you did, in your own words" retry={retry} />
}

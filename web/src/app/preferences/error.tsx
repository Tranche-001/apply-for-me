'use client'

import { ScreenError } from '@/features/ai/ui/screen-error'

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <ScreenError eyebrow="WHAT THE AI LEARNED" title="Your style rules" retry={retry} />
}

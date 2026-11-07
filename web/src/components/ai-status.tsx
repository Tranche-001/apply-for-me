// The nav's footer line: which AI is connected, or how to turn it on. Server-only: the keys are read
// at request time (never baked into the build), and the browser only learns the provider's name.
import { connection } from 'next/server'
import { Suspense } from 'react'
import { aiProvider, PROVIDERS } from '@/features/ai/provider'

function Line({ color, text, hint }: { color: string; text: string; hint?: string }) {
  return (
    <>
      <div className="nav-status">
        <span aria-hidden="true" className="dot" style={{ background: color }} />
        {text}
      </div>
      {hint && <p className="nav-hint">{hint}</p>}
    </>
  )
}

async function Status() {
  await connection()
  const provider = aiProvider()
  if (provider) return <Line color="var(--ok)" text={`${PROVIDERS[provider].label} API connected`} />
  return <Line color="var(--warn)" text="AI key missing" hint="Add ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY (Gemini) to web/.env to turn on the AI." />
}

export function AiStatus() {
  return (
    <Suspense fallback={<Line color="var(--border)" text="Checking the AI…" />}>
      <Status />
    </Suspense>
  )
}

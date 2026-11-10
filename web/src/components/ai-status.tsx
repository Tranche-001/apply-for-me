// The nav's footer: the AI model in use and the menu to change it or add your own key (components/ai-picker.tsx).
// Server-only data: keys are read at request time (never baked into the build), and the browser only gets names
// and the last four characters of a saved key.
import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadPickerView } from '@/features/ai/settings'
import { AiPicker } from './ai-picker'

async function Status() {
  await connection()
  return <AiPicker view={await loadPickerView()} />
}

function Checking() {
  return (
    <div className="nav-foot">
      <div className="nav-status">
        <span aria-hidden="true" className="dot" style={{ background: 'var(--border)' }} />
        Checking the AI…
      </div>
    </div>
  )
}

export function AiStatus() {
  return (
    <Suspense fallback={<Checking />}>
      <Status />
    </Suspense>
  )
}

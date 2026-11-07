'use client'

// Fallback for a screen that couldn't load (route error.tsx files render it). Plain words + Try again (H9).
export function ScreenError({ eyebrow, title, retry }: { eyebrow: string; title: string; retry: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
      </header>
      <div role="alert" className="card flex max-w-[560px] flex-col gap-2 p-4">
        <p className="m-0 text-[14px] font-semibold">This screen couldn’t load.</p>
        <p className="m-0 text-[13px] leading-[1.5] text-[var(--muted)]">
          Usually the database isn’t running. Start it with <code className="font-mono text-[12px]">docker compose up -d db</code>, then try
          again. Nothing you saved is lost.
        </p>
        <button type="button" className="btn-p self-start" onClick={() => retry()}>
          Try again
        </button>
      </div>
    </div>
  )
}

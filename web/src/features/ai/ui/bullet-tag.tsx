// The small P / S / I tags the library cards use for bullet kinds (decision log: "like the CV").
import type { BulletKind } from '@prisma/client'

const ABBR: Record<BulletKind, string> = {
  PROJECT: 'P',
  STACK: 'S',
  IMPACT: 'I',
  PROJECT_STACK: 'PS',
  PROJECT_IMPACT: 'PI',
  STACK_IMPACT: 'SI',
  MISSING: '?',
}

const NAMES: Record<BulletKind, string> = {
  PROJECT: 'Project',
  STACK: 'Stack',
  IMPACT: 'Impact',
  PROJECT_STACK: 'Project and stack',
  PROJECT_IMPACT: 'Project and impact',
  STACK_IMPACT: 'Stack and impact',
  MISSING: 'Missing',
}

function tone(kind: BulletKind): string {
  if (kind === 'MISSING') return 'bg-[var(--amber-soft)] text-[var(--amber)]'
  if (kind.startsWith('PROJECT')) return 'bg-[var(--indigo-soft)] text-[var(--indigo-hover)]'
  if (kind.startsWith('STACK')) return 'bg-[#eef1f5] text-[#334155]'
  return 'bg-[#e7f5ec] text-[var(--ok-ink)]'
}

export function bulletKindName(kind: BulletKind): string {
  return NAMES[kind]
}

export function BulletTag({ kind }: { kind: BulletKind }) {
  return (
    <span
      title={NAMES[kind]}
      className={`mt-px w-[26px] flex-none rounded-[3px] py-px text-center font-mono text-[9.5px] font-semibold ${tone(kind)}`}
    >
      <span aria-hidden="true">{ABBR[kind]}</span>
      <span className="sr-only">{NAMES[kind]}</span>
    </span>
  )
}

/** A drafted bullet: its tag and text, or the gap it leaves ("IMPACT?") when the fact is missing. */
export function DraftBulletLine({ kind, text, want }: { kind: BulletKind; text: string; want?: BulletKind | null }) {
  return (
    <li className="flex items-start gap-1.5">
      <BulletTag kind={kind} />
      {kind === 'MISSING' ? (
        <span className="text-[12px] italic leading-[1.4] text-[var(--amber)]">
          {want ? `${NAMES[want]}?` : 'Missing'} Nothing written: the AI had no facts for this.
        </span>
      ) : (
        <span className="text-[12px] leading-[1.4] text-[#22252c]">{text}</span>
      )}
    </li>
  )
}

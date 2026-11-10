'use client'

// The nav's footer: which AI model is on, and the menu to pick another or add your own key. Status and control in
// one place on every screen (H1, H6). Models of a service without a key stay listed, greyed, and ask for one (H5).
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useOutsideClose } from '@/components/ui/dialog'
import type { PickerGroup, PickerView } from '@/features/ai/ai-config'
import type { ModelTag, ServiceId } from '@/features/ai/catalog'
import { chooseAiModel, removeAiKey, type KeyTestResult } from '@/features/ai/settings-actions'
import { AiKeyDialog } from './ai-key-dialog'
import './ai-picker.css'

const TAGS: Record<ModelTag, { text: string; className: string }> = {
  free: { text: 'FREE TIER', className: 'aip-tagOk' },
  low: { text: 'LOW COST', className: 'aip-tagOk' },
  paid: { text: 'PAID', className: 'aip-tagWarn' },
  own: { text: 'YOUR MODEL', className: 'aip-tagOk' },
}

const TOAST_MS = 3200

function sourceLine(group: PickerGroup, busy: boolean, onAdd: () => void, onRemove: () => void) {
  if (group.source === 'env') return <span className="aip-src">Key from web/.env</span>
  if (group.source === 'saved')
    return (
      <span className="aip-src">
        Your key ••••{group.last4}
        <button type="button" className="aip-linkBtn" disabled={busy} onClick={onRemove}>Remove</button>
      </span>
    )
  return <span className="aip-src"><button type="button" className="aip-linkBtn" onClick={onAdd}>Add key</button></span>
}

export function AiPicker({ view }: { view: PickerView }) {
  const router = useRouter()
  const wrap = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<{ pending: { service: ServiceId; model: string } | null } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()
  const close = useCallback(() => setOpen(false), [])
  useOutsideClose(open, [wrap], close)

  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(id)
  }, [toast])

  const openDialog = (pending: { service: ServiceId; model: string } | null) => {
    setOpen(false)
    setDialog({ pending })
  }

  const choose = (service: ServiceId, model: string) =>
    startBusy(async () => {
      const r = await chooseAiModel({ service, model })
      setToast(r.ok ? `AI model: ${r.data.modelName}` : r.error)
      if (r.ok) {
        setOpen(false)
        router.refresh()
      }
    })

  const remove = (group: PickerGroup) =>
    startBusy(async () => {
      const r = await removeAiKey({ service: group.service })
      if (!r.ok) return setToast(r.error)
      setToast(r.data.nowUsing ? `${group.name} key removed. Now using ${r.data.nowUsing}.` : `${group.name} key removed. No AI key is left.`)
      router.refresh()
    })

  const closeDialog = useCallback(() => setDialog(null), [])
  const saved = (result: KeyTestResult) => {
    setDialog(null)
    setToast(`Key saved. AI model: ${result.modelName}`)
    router.refresh()
  }

  const current = view.current
  const sub = current ? `${current.serviceName} · ${current.source === 'saved' ? `your key ••••${current.last4}` : 'key from web/.env'}` : 'Choose an AI or add a key'

  return (
    <div ref={wrap} className="aip-wrap">
      {open && (
        <div className="aip-picker" role="dialog" aria-label="AI model">
          <div className="aip-pHead">
            <span className="aip-pTitle">AI model</span>
            <span className="aip-pHint">Used for every AI action: analysis, drafts, CV plans, answers.</span>
          </div>
          <div className="aip-pBody" role="radiogroup" aria-label="Models">
            {view.groups.map((group) => {
              const locked = group.source === null
              return (
                <div key={group.service}>
                  <div className="aip-provRow">
                    <span className="aip-provName">{group.name.toUpperCase()}</span>
                    {sourceLine(group, busy, () => openDialog(null), () => remove(group))}
                  </div>
                  {group.models.map((m) => {
                    const checked = current?.service === group.service && current.model === m.id
                    const tag = locked ? { text: 'NEEDS KEY', className: 'aip-tagMute' } : TAGS[m.tag]
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={busy}
                        className={`aip-model ${locked ? 'aip-locked' : ''}`}
                        onClick={() => (locked ? openDialog({ service: group.service, model: m.id }) : checked ? setOpen(false) : choose(group.service, m.id))}
                      >
                        <span className="aip-radio" aria-hidden="true" />
                        <span className="aip-mName">{m.name}</span>
                        <span className={`aip-tag ${tag.className}`}>{tag.text}</span>
                        <span className="aip-mNote">{m.note}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
            <div className="aip-provRow">
              <span className="aip-provName">ANOTHER AI</span>
              <span className="aip-src"><button type="button" className="aip-linkBtn" onClick={() => openDialog(null)}>Add a key</button></span>
            </div>
          </div>
          <div className="aip-pFoot">
            <span>If the model is busy, the app tries a backup model.</span>
          </div>
        </div>
      )}
      <button type="button" className="aip-foot" title={current ? `AI model: ${current.modelName}` : "AI key missing"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="aip-dot" aria-hidden="true" style={{ background: current ? 'var(--ok)' : 'var(--warn)' }} />
        <span className="aip-footModel">{current ? current.modelName : 'AI key missing'}</span>
        <svg className="aip-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 15 5-5 5 5" /></svg>
        <span className="aip-footSub">{sub}</span>
      </button>
      {dialog && <AiKeyDialog canSave={view.canSaveKeys} pending={dialog.pending} onClose={closeDialog} onSaved={saved} />}
      {toast && <div className="aip-toast" role="status">{toast}</div>}
    </div>
  )
}

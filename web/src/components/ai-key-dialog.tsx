'use client'

// "Use your own AI key": one box for a key from any AI service. The app tells the service from how the key starts;
// when it can't (or guessed wrong), you choose it, and for OpenAI-compatible services give the address and model.
// Test makes one tiny call; Save tests again, stores the key encrypted and switches to it.
import { useEffect, useRef, useState, useTransition } from 'react'
import { useModalFocus } from '@/components/ui/dialog'
import { BUILT_IN_IDS, COMPATIBLE_SERVICES, detectService, isBuiltIn, isServiceId, serviceName, type CompatibleId, type ServiceId } from '@/features/ai/catalog'
import { saveAiKey, testAiKey, type KeyInput, type KeyTestResult } from '@/features/ai/settings-actions'
import './ai-picker.css'

type Props = {
  canSave: boolean
  /** A model clicked in the list whose service had no key: saving a key for that service picks it. */
  pending: { service: ServiceId; model: string } | null
  onClose: () => void
  onSaved: (result: KeyTestResult) => void
}

type Outcome = { ok: true; text: string } | { ok: false; text: string } | null

const NO_SECRET = 'To save keys, add AI_KEYS_SECRET to web/.env (any random text of 16 characters or more) and restart the app. You can still test a key.'

const describe = (r: KeyTestResult): string => `Key works. ${r.modelName} answered in ${(r.ms / 1000).toFixed(1)} s and returned the app’s structured format.`

export function AiKeyDialog({ canSave, pending, onClose, onSaved }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [key, setKey] = useState('')
  const [manual, setManual] = useState<ServiceId | '' | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(null)
  const [busy, startBusy] = useTransition()
  useModalFocus(true, box)

  useEffect(() => {
    document.getElementById('ai-key-input')?.focus()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const detected = detectService(key)
  const service: ServiceId | null = manual === null ? detected : manual || null
  const compatible = service !== null && !isBuiltIn(service)
  const showOther = key.trim().length > 0 && (manual !== null || detected === null)

  const changed = (apply: () => void) => {
    apply()
    setOutcome(null)
  }

  const pickService = (value: string) =>
    changed(() => {
      const next = isServiceId(value) ? value : ''
      setManual(next)
      setBaseUrl(next && !isBuiltIn(next) ? COMPATIBLE_SERVICES[next as CompatibleId].url : '')
    })

  const input = (): KeyInput => ({
    key: key.trim(),
    ...(service ? { service } : {}),
    // An empty address means the service's known one (targetFor fills it in).
    ...(compatible ? { ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), model: model.trim() } : {}),
    ...(!compatible && pending && pending.service === service ? { model: pending.model } : {}),
  })

  const test = () =>
    startBusy(async () => {
      const r = await testAiKey(input())
      setOutcome(r.ok ? { ok: true, text: describe(r.data) } : { ok: false, text: r.error })
    })

  const save = () =>
    startBusy(async () => {
      const r = await saveAiKey(input())
      if (r.ok) onSaved(r.data)
      else setOutcome({ ok: false, text: r.error })
    })

  const saveLabel = service ? `Save and use ${serviceName(service)}` : 'Save'

  return (
    <div className="aip-scrim" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div ref={box} className="aip-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-key-title">
        <div className="aip-dHead">
          <div>
            <h2 className="aip-dTitle" id="ai-key-title">Use your own AI key</h2>
            <p className="aip-dSub">AI calls then go through your account and are billed by that service, not by apply-for-me.</p>
          </div>
          <button type="button" className="aip-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="aip-dBody">
          <div className="aip-field">
            <label className="aip-label" htmlFor="ai-key-input">API key</label>
            <div className="aip-inRow">
              <input
                id="ai-key-input"
                className={`aip-input aip-mono`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a key from the AI you use"
                value={key}
                onChange={(ev) => changed(() => setKey(ev.target.value))}
              />
              <button type="button" className="aip-btnS" disabled={busy || !key.trim()} onClick={test}>
                {busy ? 'Testing…' : 'Test'}
              </button>
            </div>
            <p className="aip-help">Claude, Gemini, OpenAI, OpenRouter, DeepSeek, Mistral, Groq, xAI and others. The app tells most keys apart by how they start.</p>
          </div>

          {key.trim() && detected && manual === null && (
            <div className="aip-detect">
              <span>Recognised: <b>{serviceName(detected)}</b></span>
              <button type="button" className="aip-linkBtn" onClick={() => pickService('')}>Not right?</button>
            </div>
          )}

          {(showOther || compatible) && (
            <div className="aip-other">
              {showOther && (
                <div className={`aip-field aip-wide`}>
                  <label className="aip-label" htmlFor="ai-key-service">Which service is this key from?</label>
                  <select id="ai-key-service" className="aip-select" value={manual ?? ''} onChange={(ev) => pickService(ev.target.value)}>
                    <option value="">Choose…</option>
                    {BUILT_IN_IDS.map((id) => <option key={id} value={id}>{serviceName(id)}</option>)}
                    {(Object.keys(COMPATIBLE_SERVICES) as CompatibleId[]).map((id) => <option key={id} value={id}>{COMPATIBLE_SERVICES[id].name}</option>)}
                  </select>
                </div>
              )}
              {compatible && (
                <>
                  <div className="aip-field">
                    <label className="aip-label" htmlFor="ai-key-url">API address</label>
                    <input id="ai-key-url" className={`aip-input aip-mono`} spellCheck={false} placeholder={(service && !isBuiltIn(service) && COMPATIBLE_SERVICES[service as CompatibleId].url) || 'https://…/v1'} value={baseUrl} onChange={(ev) => changed(() => setBaseUrl(ev.target.value))} />
                  </div>
                  <div className="aip-field">
                    <label className="aip-label" htmlFor="ai-key-model">Model</label>
                    <input id="ai-key-model" className={`aip-input aip-mono`} spellCheck={false} placeholder="as the service writes it" value={model} onChange={(ev) => changed(() => setModel(ev.target.value))} />
                  </div>
                  <p className={`aip-help aip-wide`}>Any service with an OpenAI-compatible API works. Test checks that the model can return the structured answers the app needs, which small models often can’t.</p>
                </>
              )}
            </div>
          )}

          {outcome && <div className={`aip-result ${outcome.ok ? 'aip-resultOk' : 'aip-resultBad'}`} role="status">{outcome.ok ? '✓ ' : ''}{outcome.text}</div>}
          {!canSave && <div className={`aip-result aip-resultBad`}>{NO_SECRET}</div>}

          <div className="aip-safe">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span>Saved encrypted on the server and never sent back to the browser. After saving you only see the last 4 characters. You can remove it at any time.</span>
          </div>
        </div>
        <div className="aip-dFoot">
          <button type="button" className="aip-btnS" onClick={onClose}>Cancel</button>
          <button type="button" className="aip-btnP" disabled={busy || !canSave || !outcome?.ok} onClick={save}>{busy ? 'Saving…' : saveLabel}</button>
        </div>
      </div>
    </div>
  )
}

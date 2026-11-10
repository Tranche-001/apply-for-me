import 'server-only'
// The AI chosen in the nav, read from the database at request time. Keys are decrypted only here, on the server,
// and only for the call that needs them; the browser gets a PickerView (last four characters at most).
import { db } from '@/lib/db'
import { buildPickerView, resolveChoice, type Choice, type KeySource, type PickerView, type SavedKeyInfo } from './ai-config'
import { isBuiltIn, isServiceId, type ServiceId } from './catalog'
import { decryptKey, keySecret } from './key-crypto'
import { providerKey } from './provider'

export const CHOICE_ID = 'current'

/** The service, model and key one AI call uses. Server only; never sent to the browser or logged. */
export type AiTarget = { service: ServiceId; model: string; key: string; baseUrl: string | null; source: KeySource }

type KeyRow = { service: string; cipher: string; last4: string; baseUrl: string | null; model: string | null }

/** The saved keys this server can use: rows it cannot decrypt (secret changed or missing) are left out. */
async function loadKeyRows(): Promise<(SavedKeyInfo & { key: string })[]> {
  const secret = keySecret()
  if (!secret) return []
  const rows: KeyRow[] = await db.aiKey.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.flatMap((row) => {
    const key = isServiceId(row.service) ? decryptKey(row.cipher, secret, row.service) : null
    if (!key || !isServiceId(row.service)) return []
    return [{ service: row.service, last4: row.last4, baseUrl: row.baseUrl, model: row.model, key }]
  })
}

async function loadChoice(): Promise<Choice> {
  const row = await db.aiChoice.findUnique({ where: { id: CHOICE_ID } })
  return row && isServiceId(row.service) ? { service: row.service, model: row.model } : null
}

/** Database errors here should not take the whole app down: without them, web/.env still picks the AI. */
async function loadSettings(): Promise<{ keys: (SavedKeyInfo & { key: string })[]; choice: Choice }> {
  try {
    const [keys, choice] = await Promise.all([loadKeyRows(), loadChoice()])
    return { keys, choice }
  } catch (err) {
    console.error('[ai] could not read the AI settings', { name: err instanceof Error ? err.name : typeof err })
    return { keys: [], choice: null }
  }
}

const info = ({ service, last4, baseUrl, model }: SavedKeyInfo): SavedKeyInfo => ({ service, last4, baseUrl, model })

/** The AI for this request, with its key; null when no key is set anywhere. */
export async function currentTarget(): Promise<AiTarget | null> {
  const { keys, choice } = await loadSettings()
  const resolved = resolveChoice(process.env, keys.map(info), choice)
  if (!resolved) return null
  const saved = keys.find((k) => k.service === resolved.service)
  const fromEnv = isBuiltIn(resolved.service) ? providerKey(process.env, resolved.service) : null
  const key = resolved.source === 'saved' ? saved?.key : fromEnv
  if (!key) return null
  return { service: resolved.service, model: resolved.model, key, baseUrl: saved?.baseUrl ?? null, source: resolved.source }
}

/** True when some AI can answer (screens use it to say how to set the AI up instead). */
export async function aiReady(): Promise<boolean> {
  return (await currentTarget()) !== null
}

/** What the nav's AI menu shows. */
export async function loadPickerView(): Promise<PickerView> {
  const { keys, choice } = await loadSettings()
  return buildPickerView(process.env, keys.map(info), choice, keySecret() !== null)
}

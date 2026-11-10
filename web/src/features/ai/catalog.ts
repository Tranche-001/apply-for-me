// Which AI services and models the nav's AI menu offers, and how a pasted key tells its service.
// Plain data, no SDKs and no keys: safe to import in the browser and in tests.
import { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL, MODEL, OPENAI_DEFAULT_MODEL, OPENAI_FALLBACK_MODEL } from './model'

/** The three providers with their own code path (SDK) in the app. */
export type BuiltInId = 'claude' | 'gemini' | 'openai'

/** Services reached through their OpenAI-compatible API: you give the model name. */
export type CompatibleId = 'openrouter' | 'deepseek' | 'mistral' | 'groq' | 'xai' | 'custom'

export type ServiceId = BuiltInId | CompatibleId

/** Free tier, cheap, needs billing on the key, or a model you named yourself. Shown as a small tag. */
export type ModelTag = 'free' | 'low' | 'paid' | 'own'

export type CatalogModel = { id: string; name: string; note: string; tag: ModelTag }

export const BUILT_IN_IDS: readonly BuiltInId[] = ['gemini', 'openai', 'claude']

export const BUILT_IN_MODELS: Record<BuiltInId, readonly CatalogModel[]> = {
  gemini: [
    { id: GEMINI_DEFAULT_MODEL, name: 'Gemini 3.8 Flash', note: 'Fast. Free tier: 20 calls a day.', tag: 'free' },
    { id: GEMINI_FALLBACK_MODEL, name: 'Gemini 3.6 Flash', note: 'Backup when 3.8 is busy. Free tier.', tag: 'free' },
    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', note: 'Google’s strongest. Needs billing on the key.', tag: 'paid' },
  ],
  openai: [
    { id: OPENAI_DEFAULT_MODEL, name: 'GPT-6 Luna', note: 'Cheapest. A job analysis took about 5 minutes.', tag: 'low' },
    { id: OPENAI_FALLBACK_MODEL, name: 'GPT-6.1 Terra', note: 'Stronger and faster. Needs credits.', tag: 'paid' },
  ],
  claude: [
    { id: MODEL, name: 'Claude Opus 5.5', note: 'Best writing and reasoning. Slowest, most expensive.', tag: 'paid' },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: 'Fast and cheap. Good for drafts and short answers.', tag: 'low' },
  ],
}

export const COMPATIBLE_SERVICES: Record<CompatibleId, { name: string; url: string }> = {
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  deepseek: { name: 'DeepSeek', url: 'https://api.deepseek.com' },
  mistral: { name: 'Mistral', url: 'https://api.mistral.ai/v1' },
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1' },
  xai: { name: 'xAI (Grok)', url: 'https://api.x.ai/v1' },
  custom: { name: 'Other (OpenAI-compatible)', url: '' },
}

const BUILT_IN_NAMES: Record<BuiltInId, string> = { claude: 'Claude', gemini: 'Gemini', openai: 'OpenAI' }

export const SERVICE_IDS: readonly ServiceId[] = [...BUILT_IN_IDS, ...(Object.keys(COMPATIBLE_SERVICES) as CompatibleId[])]

export const isServiceId = (value: unknown): value is ServiceId => SERVICE_IDS.includes(value as ServiceId)

export const isBuiltIn = (id: ServiceId): id is BuiltInId => (BUILT_IN_IDS as readonly string[]).includes(id)

/** "Claude", "Mistral", "xAI (Grok)"; "Other service" for a custom address. */
export function serviceName(id: ServiceId): string {
  if (isBuiltIn(id)) return BUILT_IN_NAMES[id]
  return id === 'custom' ? 'Other service' : COMPATIBLE_SERVICES[id].name
}

/** The display name of a model: the catalog's name, else the id as the service writes it. */
export function modelName(service: ServiceId, model: string): string {
  if (!isBuiltIn(service)) return model
  return BUILT_IN_MODELS[service].find((m) => m.id === model)?.name ?? model
}

// Most specific first: "sk-ant-" and "sk-or-" also start with "sk-".
const PREFIXES: readonly (readonly [string, ServiceId])[] = [
  ['sk-ant-', 'claude'],
  ['AIza', 'gemini'],
  ['sk-or-', 'openrouter'],
  ['gsk_', 'groq'],
  ['xai-', 'xai'],
  ['sk-', 'openai'],
]

/**
 * The service a key belongs to, from how it starts; null when the key doesn't say (Mistral keys have no prefix).
 * A DeepSeek key also starts with "sk-" and reads as OpenAI; the dialog's "Not right?" corrects it.
 */
export function detectService(key: string): ServiceId | null {
  const trimmed = key.trim()
  return PREFIXES.find(([prefix]) => trimmed.startsWith(prefix))?.[1] ?? null
}

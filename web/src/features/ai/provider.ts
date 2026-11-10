// Which AI provider the app uses: Claude (Anthropic), Gemini (Google) or OpenAI, picked from web/.env.
// No SDK imports and no key values here, so screens and tests can import it.

export type ProviderId = 'claude' | 'gemini' | 'openai'

export const PROVIDERS = {
  claude: { label: 'Claude', keyVar: 'ANTHROPIC_API_KEY', console: 'the Claude Console' },
  gemini: { label: 'Gemini', keyVar: 'GEMINI_API_KEY', console: 'Google AI Studio' },
  openai: { label: 'OpenAI', keyVar: 'OPENAI_API_KEY', console: 'the OpenAI dashboard' },
} as const satisfies Record<ProviderId, { label: string; keyVar: string; console: string }>

/** Other names accepted for a key (OPEN_AI_API_KEY is a common spelling of OPENAI_API_KEY). */
const KEY_ALIASES: Partial<Record<ProviderId, readonly string[]>> = { openai: ['OPEN_AI_API_KEY'] }

export const NOT_READY = 'The AI is not set up yet. Open the AI menu at the bottom of the left menu and add a key, or put ANTHROPIC_API_KEY, GEMINI_API_KEY or OPENAI_API_KEY in web/.env.'

type Env = Partial<Record<string, string | undefined>>

/** The key for a provider from its own variable or an accepted alias; null when none is set. Never logged. */
export function providerKey(env: Env, id: ProviderId): string | null {
  for (const name of [PROVIDERS[id].keyVar, ...(KEY_ALIASES[id] ?? [])]) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return null
}

const PICK_ORDER: readonly ProviderId[] = ['claude', 'gemini', 'openai']
const isProvider = (value: string | undefined): value is ProviderId => PICK_ORDER.includes(value as ProviderId)

/**
 * AI_PROVIDER ("claude", "gemini" or "openai") picks one when several keys are set; it needs its own key.
 * Without it: the first with a key, in the order Claude, Gemini, OpenAI; else none.
 */
export function pickProvider(env: Env): ProviderId | null {
  const wanted = env.AI_PROVIDER?.trim().toLowerCase()
  if (isProvider(wanted)) return providerKey(env, wanted) ? wanted : null
  return PICK_ORDER.find((id) => providerKey(env, id)) ?? null
}

/** The provider for this server process. Read at request time; never exposes the key. */
export function aiProvider(): ProviderId | null {
  return pickProvider(process.env)
}

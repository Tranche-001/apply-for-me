// Which AI provider the app uses: Claude (Anthropic) or Gemini (Google), picked from web/.env.
// No SDK imports and no key values here, so screens and tests can import it.

export type ProviderId = 'claude' | 'gemini'

export const PROVIDERS = {
  claude: { label: 'Claude', keyVar: 'ANTHROPIC_API_KEY', console: 'the Claude Console' },
  gemini: { label: 'Gemini', keyVar: 'GEMINI_API_KEY', console: 'Google AI Studio' },
} as const satisfies Record<ProviderId, { label: string; keyVar: string; console: string }>

export const NOT_READY = 'The AI is not set up yet. Add ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY (Gemini) to web/.env.'

type Env = Partial<Record<string, string | undefined>>

const hasKey = (env: Env, id: ProviderId) => Boolean(env[PROVIDERS[id].keyVar]?.trim())

/**
 * AI_PROVIDER ("claude" or "gemini") picks one when both keys are set; it needs its own key.
 * Without it: Claude when its key is set, else Gemini when its key is set, else none.
 */
export function pickProvider(env: Env): ProviderId | null {
  const wanted = env.AI_PROVIDER?.trim().toLowerCase()
  if (wanted === 'claude' || wanted === 'gemini') return hasKey(env, wanted) ? wanted : null
  if (hasKey(env, 'claude')) return 'claude'
  if (hasKey(env, 'gemini')) return 'gemini'
  return null
}

/** The provider for this server process. Read at request time; never exposes the key. */
export function aiProvider(): ProviderId | null {
  return pickProvider(process.env)
}

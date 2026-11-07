// Which model the app uses and how hard it thinks. Plain constants, safe to import anywhere.

export const MODEL = 'claude-opus-5-5'

/**
 * Gemini model when GEMINI_API_KEY is used. gemini-3.8-flash is on Google's free tier; set
 * GEMINI_MODEL=gemini-4-argon in web/.env for Google's flagship model (paid tier only).
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash'

/** Tried when the chosen Gemini model is overloaded (5xx or too slow). Free tier, usually quick. */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.6-flash'

/**
 * One try per Gemini model (also sent as the server deadline); an overloaded model is not retried,
 * the fallback is tried instead. Under load a hard call took ~70 s.
 */
export const GEMINI_ATTEMPT_TIMEOUT_MS = 120_000

/** Server-side fallback on a policy decline: the API retries on its default fallback model. */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/** Long calls stream; the SDK times out a single attempt after this many milliseconds. */
export const REQUEST_TIMEOUT_MS = 5 * 60_000
export const MAX_RETRIES = 2

export type Effort = 'low' | 'medium' | 'high'

/** Per task: output budget and thinking effort. Planning and analysis are the hard ones. */
export const TASKS = {
  cvPlan: { maxTokens: 64_000, effort: 'high' },
  analysis: { maxTokens: 64_000, effort: 'high' },
  answer: { maxTokens: 16_000, effort: 'medium' },
  blockDraft: { maxTokens: 16_000, effort: 'medium' },
  /** Company and role from a posting: a few words out, so little thinking and a small budget. */
  jobInfo: { maxTokens: 2_000, effort: 'low' },
  /** Which experience each written answer belongs to: short structured output. */
  placement: { maxTokens: 6_000, effort: 'low' },
} as const satisfies Record<string, { maxTokens: number; effort: Effort }>

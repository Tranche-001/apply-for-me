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

/**
 * OpenAI model when the OpenAI key is used (OPENAI_MODEL in web/.env overrides it). gpt-6-luna: the cheapest of
 * the GPT-6 family (~$0.10 / $0.50 per million input / output tokens, Oct 2026 prices) and the one a key with no
 * credits could still call (2026-11-08; gpt-6.1-terra answered 429 "credit_balance_exhausted").
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-6-luna'

/** Tried when the chosen OpenAI model is overloaded or out of quota: stronger, paid (~$1 / $5), needs credits. */
export const OPENAI_FALLBACK_MODEL = 'gpt-6.1-terra'

/**
 * One try per OpenAI model; the fallback is tried instead of waiting twice. A real Job analysis on gpt-6-luna
 * (60k-character prompt, effort high) took 297 s on 2026-11-08, so 3 minutes was too short.
 */
export const OPENAI_ATTEMPT_TIMEOUT_MS = 600_000

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
  /** The jobs a posting holds, with names, anchors and two quotes each: short structured output, little thinking. */
  postingJobs: { maxTokens: 4_000, effort: 'low' },
  /** Which experience each written answer belongs to: short structured output. */
  placement: { maxTokens: 6_000, effort: 'low' },
  /** REVIEW: a new CV from his request (order, swaps, sections, titles, maybe new wording). */
  cvReview: { maxTokens: 32_000, effort: 'medium' },
  /** "Remember this": his request as 1 to 3 short rules. */
  reviewRules: { maxTokens: 2_000, effort: 'low' },
} as const satisfies Record<string, { maxTokens: number; effort: Effort }>

// Plain-language messages for everything that can go wrong with an AI call (H9).
// No codes, no stack traces: say what happened and what to do next.
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { PROVIDERS, type ProviderId } from './provider'

/** The model declined (Claude: stop_reason "refusal", even after the fallback; Gemini: blocked). */
export class AiRefusalError extends Error {
  constructor() {
    super('refusal')
    this.name = 'AiRefusalError'
  }
}

/** The answer hit the output limit before it finished. */
export class AiTruncatedError extends Error {
  constructor() {
    super('truncated')
    this.name = 'AiTruncatedError'
  }
}

/** The answer was not valid JSON for the expected schema. */
export class AiInvalidOutputError extends Error {
  constructor(detail: string) {
    super(detail)
    this.name = 'AiInvalidOutputError'
  }
}

/** What to tell you, worded for the provider in use (its name, its key, where to check it). */
export function aiMessages(provider: ProviderId) {
  const { label, keyVar, console } = PROVIDERS[provider]
  return {
    refusal: 'The AI declined to write this one. Try rewording your notes, or write it yourself.',
    truncated: 'The AI’s answer was cut off before it finished. Nothing was changed; try again.',
    invalid: 'The AI’s answer came back in an unexpected shape, so nothing was changed. Try again.',
    auth: `The ${label} API key (${keyVar} in web/.env) was refused. Check that it is correct and still active.`,
    permission: `This ${label} API key can’t use the model. Check its access and billing in ${console}.`,
    rateLimit: 'Too many AI requests right now, or the key’s quota is used up. Wait a minute and try again.',
    timeout: 'The AI took too long to answer. Nothing was changed; try again.',
    connection: `Couldn’t reach the ${label} API. Check your internet connection and try again.`,
    busy: `The ${label} API is busy or having trouble. Try again in a moment.`,
    tooLarge: 'This request is too long for the AI. Shorten the posting text or your notes and try again.',
    badRequest: `The ${label} API rejected the request. Try again; if it keeps failing, shorten the text you sent.`,
    unknown: 'Something went wrong with the AI. Your text is unchanged; try again.',
  } as const
}

type MessageKey = keyof ReturnType<typeof aiMessages>

type GeminiApiError = Error & { status: number }

/** The Gemini SDK's ApiError, matched by name: the SDK ships ESM and CJS builds, so `instanceof` can miss. */
export function isGeminiApiError(err: unknown): err is GeminiApiError {
  return err instanceof Error && err.name === 'ApiError' && typeof (err as { status?: unknown }).status === 'number'
}

/** Gemini errors carry only an HTTP status. An invalid key comes back as 400 with "API key" in the text. */
function geminiKind(err: GeminiApiError): MessageKey {
  const { status } = err
  if (status === 401 || (status === 400 && /api[ _]?key/i.test(err.message))) return 'auth'
  if (status === 403 || status === 404) return 'permission'
  if (status === 429) return 'rateLimit'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 413) return 'tooLarge'
  if (status >= 500) return 'busy'
  if (status === 400) return 'badRequest'
  return 'unknown'
}

type OpenAiApiError = InstanceType<typeof OpenAI.APIError> & { status: number }

/**
 * The OpenAI SDK's APIError with an HTTP status. Matched by class: the SDK names every error "Error", so the name
 * tells nothing (a timeout looked like an unknown error until 2026-11-08).
 */
export function isOpenAiApiError(err: unknown): err is OpenAiApiError {
  return err instanceof OpenAI.APIError && typeof err.status === 'number'
}

/** OpenAI's own class name for logs (the SDK leaves `name` as "Error"). */
const openAiClassName = (err: InstanceType<typeof OpenAI.OpenAIError>): string => err.constructor?.name || 'OpenAIError'

/** OpenAI errors by HTTP status, like Gemini's. A too-long request comes back as 400 with "context" in the text. */
function openAiKind(err: OpenAiApiError): MessageKey {
  const { status } = err
  if (status === 401) return 'auth'
  if (status === 403 || status === 404) return 'permission'
  if (status === 429) return 'rateLimit'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 413 || (status === 400 && /context|too long|maximum/i.test(err.message))) return 'tooLarge'
  if (status >= 500) return 'busy'
  if (status === 400) return 'badRequest'
  return 'unknown'
}

/** fetch-level failures (the Gemini SDK lets them through): our timeout aborts, or no network. */
function fetchKind(err: unknown): MessageKey | null {
  if (!(err instanceof Error)) return null
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return 'timeout'
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) return 'connection'
  return null
}

function errorKind(err: unknown): MessageKey {
  if (err instanceof AiRefusalError) return 'refusal'
  if (err instanceof AiTruncatedError) return 'truncated'
  if (err instanceof AiInvalidOutputError) return 'invalid'
  // Claude: most specific first (timeout before connection, overloaded before server error).
  if (err instanceof Anthropic.AuthenticationError) return 'auth'
  if (err instanceof Anthropic.PermissionDeniedError) return 'permission'
  if (err instanceof Anthropic.RateLimitError) return 'rateLimit'
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout'
  if (err instanceof Anthropic.RequestTimeoutError) return 'timeout'
  if (err instanceof Anthropic.APIConnectionError) return 'connection'
  if (err instanceof Anthropic.ContentTooLargeError) return 'tooLarge'
  if (err instanceof Anthropic.InternalServerError) return 'busy'
  if (err instanceof Anthropic.BadRequestError) return 'badRequest'
  if (isGeminiApiError(err)) return geminiKind(err)
  // OpenAI: by class, timeout before connection (a timeout is a connection error too).
  if (err instanceof OpenAI.APIConnectionTimeoutError) return 'timeout'
  if (err instanceof OpenAI.APIConnectionError) return 'connection'
  if (isOpenAiApiError(err)) return openAiKind(err)
  return fetchKind(err) ?? 'unknown'
}

export function plainAiError(err: unknown, provider: ProviderId): string {
  return aiMessages(provider)[errorKind(err)]
}

/** What may be logged on the server: the error's class and status, never prompt or CV text. */
export function errorLogContext(err: unknown): Record<string, unknown> {
  if (err instanceof Anthropic.APIError) {
    return { name: err.name, status: err.status, requestID: err.requestID ?? null, errorCode: err.errorCode }
  }
  if (isGeminiApiError(err)) return { name: 'GeminiApiError', status: err.status }
  if (err instanceof OpenAI.OpenAIError) {
    // The class name is minified in production builds; the API's error code says what happened (e.g.
    // "rate_limit_exceeded", "insufficient_quota", "credit_balance_exhausted"). Never the message (may echo input).
    const api = err instanceof OpenAI.APIError ? err : null
    return {
      name: `OpenAI ${openAiClassName(err)}`,
      status: typeof api?.status === 'number' ? api.status : null,
      ...(api?.code ? { code: api.code } : {}),
      ...(api?.type ? { type: api.type } : {}),
    }
  }
  if (err instanceof Error) return { name: err.name }
  return { name: typeof err }
}

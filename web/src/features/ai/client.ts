import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import type { z } from 'zod'
import type { KeySource } from './ai-config'
import type { ServiceId } from './catalog'
import { runCompatibleStructured } from './compatible-run'
import { runGeminiStructured } from './gemini-run'
import { GEMINI_ATTEMPT_TIMEOUT_MS, GEMINI_FALLBACK_MODEL, MAX_RETRIES, OPENAI_ATTEMPT_TIMEOUT_MS, OPENAI_FALLBACK_MODEL, REQUEST_TIMEOUT_MS } from './model'
import { runOpenAiStructured } from './openai-run'
import type { Prompt } from './prompts'
import { runStructured, type TaskConfig } from './run'
import { currentTarget, type AiTarget } from './settings'

/** One structured AI call, on the service and model chosen in the nav (or picked by web/.env). */
export type AiRunner = {
  provider: ServiceId
  /** Where the key came from, so an error can name the right one. */
  source?: KeySource
  run<T>(prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T>
}

type Timeouts = { claude: number; attempt: number }

const NORMAL: Timeouts = { claude: REQUEST_TIMEOUT_MS, attempt: Math.max(GEMINI_ATTEMPT_TIMEOUT_MS, OPENAI_ATTEMPT_TIMEOUT_MS) }

/** A key test is one tiny call: it should answer within seconds, not minutes. */
const PROBE: Timeouts = { claude: 30_000, attempt: 30_000 }

// One client per server process, service, key, address and timeout. Keys stay on the server and are never logged.
const clients = new Map<string, Anthropic | GoogleGenAI | OpenAI>()
const MAX_CLIENTS = 8

function cached<C extends Anthropic | GoogleGenAI | OpenAI>(id: string, make: () => C): C {
  const found = clients.get(id)
  if (found) return found as C
  if (clients.size >= MAX_CLIENTS) clients.clear()
  const client = make()
  clients.set(id, client)
  return client
}

/** The model to try first, then the provider's backup when it is busy (once, not twice). */
const withFallback = (model: string, fallback: string): string[] => [...new Set([model, fallback])]

function runnerFor(target: AiTarget, timeouts: Timeouts, source: KeySource): AiRunner {
  const { service, model, key, baseUrl } = target
  const id = [service, key, baseUrl ?? '', timeouts.claude, timeouts.attempt].join('|')
  if (service === 'claude') {
    const client = cached(id, () => new Anthropic({ apiKey: key, timeout: timeouts.claude, maxRetries: MAX_RETRIES }))
    return { provider: service, source, run: (prompt, schema, task) => runStructured(client, prompt, schema, task, model) }
  }
  if (service === 'gemini') {
    // No SDK retries: runGeminiStructured moves on to the fallback model instead of waiting twice.
    const timeout = Math.min(timeouts.attempt, GEMINI_ATTEMPT_TIMEOUT_MS)
    const client = cached(id, () => new GoogleGenAI({ apiKey: key, httpOptions: { timeout } }))
    const models = withFallback(model, GEMINI_FALLBACK_MODEL)
    return { provider: service, source, run: (prompt, schema, task) => runGeminiStructured(client, models, prompt, schema, task) }
  }
  if (service === 'openai') {
    const timeout = Math.min(timeouts.attempt, OPENAI_ATTEMPT_TIMEOUT_MS)
    const client = cached(id, () => new OpenAI({ apiKey: key, timeout, maxRetries: 0 }))
    const models = withFallback(model, OPENAI_FALLBACK_MODEL)
    return { provider: service, source, run: (prompt, schema, task) => runOpenAiStructured(client, models, prompt, schema, task) }
  }
  // OpenAI-compatible services: the address saved with the key, the model you named.
  const timeout = Math.min(timeouts.attempt, OPENAI_ATTEMPT_TIMEOUT_MS)
  const client = cached(id, () => new OpenAI({ apiKey: key, baseURL: baseUrl ?? undefined, timeout, maxRetries: 1 }))
  return { provider: service, source, run: (prompt, schema, task) => runCompatibleStructured(client, model, prompt, schema, task) }
}

/** The AI for this request, or null when no key is set (screens then say how to set it up). */
export async function getAi(): Promise<AiRunner | null> {
  const target = await currentTarget()
  return target ? runnerFor(target, NORMAL, target.source) : null
}

/** A runner for a key that is not saved yet, for the key test in the AI menu. */
export function probeRunner(target: AiTarget): AiRunner {
  return runnerFor(target, PROBE, 'saved')
}

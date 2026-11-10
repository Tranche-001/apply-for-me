import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import type { z } from 'zod'
import { runGeminiStructured } from './gemini-run'
import {
  GEMINI_ATTEMPT_TIMEOUT_MS,
  GEMINI_DEFAULT_MODEL,
  GEMINI_FALLBACK_MODEL,
  MAX_RETRIES,
  OPENAI_ATTEMPT_TIMEOUT_MS,
  OPENAI_DEFAULT_MODEL,
  OPENAI_FALLBACK_MODEL,
  REQUEST_TIMEOUT_MS,
} from './model'
import { runOpenAiStructured } from './openai-run'
import type { Prompt } from './prompts'
import { aiProvider, providerKey, type ProviderId } from './provider'
import { runStructured, type TaskConfig } from './run'

/** One structured AI call, whichever provider web/.env picked. */
export type AiRunner = {
  provider: ProviderId
  run<T>(prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T>
}

// One client per server process and key. Keys stay on the server and are never logged.
let claude: { key: string; client: Anthropic } | null = null
let gemini: { key: string; client: GoogleGenAI } | null = null
let openai: { key: string; client: OpenAI } | null = null

function claudeClient(key: string): Anthropic {
  if (claude?.key !== key) claude = { key, client: new Anthropic({ apiKey: key, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES }) }
  return claude.client
}

function geminiClient(key: string): GoogleGenAI {
  // No SDK retries: runGeminiStructured moves on to the fallback model instead of waiting twice.
  if (gemini?.key !== key) gemini = { key, client: new GoogleGenAI({ apiKey: key, httpOptions: { timeout: GEMINI_ATTEMPT_TIMEOUT_MS } }) }
  return gemini.client
}

function openAiClient(key: string): OpenAI {
  // No SDK retries: runOpenAiStructured moves on to the fallback model instead of waiting twice.
  if (openai?.key !== key) openai = { key, client: new OpenAI({ apiKey: key, timeout: OPENAI_ATTEMPT_TIMEOUT_MS, maxRetries: 0 }) }
  return openai.client
}

/** The AI for this request, or null when no key is set (screens then say how to set it up). */
export function getAi(): AiRunner | null {
  const provider = aiProvider()
  if (provider === 'claude') {
    const client = claudeClient(process.env.ANTHROPIC_API_KEY!.trim())
    return { provider, run: (prompt, schema, task) => runStructured(client, prompt, schema, task) }
  }
  if (provider === 'gemini') {
    const client = geminiClient(process.env.GEMINI_API_KEY!.trim())
    const model = process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL
    const models = [...new Set([model, GEMINI_FALLBACK_MODEL])]
    return { provider, run: (prompt, schema, task) => runGeminiStructured(client, models, prompt, schema, task) }
  }
  if (provider === 'openai') {
    const client = openAiClient(providerKey(process.env, 'openai')!)
    const model = process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL
    const models = [...new Set([model, OPENAI_FALLBACK_MODEL])]
    return { provider, run: (prompt, schema, task) => runOpenAiStructured(client, models, prompt, schema, task) }
  }
  return null
}

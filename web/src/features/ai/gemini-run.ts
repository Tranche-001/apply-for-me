// One structured Gemini call (used when GEMINI_API_KEY is the key in web/.env). Same contract as
// runStructured in run.ts: same prompt, same JSON schema, same Zod check, same errors on a block or a
// cut-off answer. Uses generateContent, which Google keeps fully supported. When the chosen model is
// overloaded it falls back to the next one (like Claude's server-side fallback).
// The client is passed in, so tests can hand it a fake one.
import { FinishReason, ThinkingLevel, type GenerateContentParameters, type GoogleGenAI } from '@google/genai'
import { z } from 'zod'
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError, isGeminiApiError } from './errors'
import type { Effort } from './model'
import type { Prompt } from './prompts'
import { strictJsonSchema, type TaskConfig } from './run'
import { parseModelJson } from './schemas'

const THINKING: Record<Effort, ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }

/** Gemini stopped because of its content filters: shown to you as "the AI declined". */
const BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.LANGUAGE,
])

export function buildGeminiRequest(model: string, prompt: Prompt, schema: z.ZodType, task: TaskConfig): GenerateContentParameters {
  return {
    model,
    // The rules go in the system instruction; your material comes first in the message, so Gemini's
    // implicit cache can reuse it between calls.
    contents: [{ role: 'user', parts: [{ text: prompt.context }, { text: prompt.request }] }],
    config: {
      systemInstruction: prompt.system,
      maxOutputTokens: task.maxTokens,
      thinkingConfig: { thinkingLevel: THINKING[task.effort] },
      responseMimeType: 'application/json',
      responseJsonSchema: strictJsonSchema(schema),
    },
  }
}

/**
 * Worth trying the next model: Gemini is overloaded or failing (5xx), too slow (our per-attempt timeout),
 * or out of quota (429). Free-tier quotas are per model, so the fallback usually still has room.
 */
const OVERLOADED = new Set([429, 500, 502, 503, 504])

export function isOverloaded(err: unknown): boolean {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return true
  return isGeminiApiError(err) && OVERLOADED.has(err.status)
}

/**
 * Tries each model in order (the chosen one, then the fallback) while Google reports it overloaded.
 * Any other failure (bad key, no access, a blocked or cut-off answer) stops right away: another model
 * would not fix it.
 */
export async function runGeminiStructured<T>(client: GoogleGenAI, models: readonly string[], prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T> {
  let lastError: unknown = new Error('no Gemini model configured')
  for (const [i, model] of models.entries()) {
    try {
      return await runOnce(client, model, prompt, schema, task)
    } catch (err) {
      if (!isOverloaded(err)) throw err
      lastError = err
      if (i < models.length - 1) console.warn(`[ai] ${model} is overloaded; trying ${models[i + 1]}`)
    }
  }
  throw lastError
}

async function runOnce<T>(client: GoogleGenAI, model: string, prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T> {
  const response = await client.models.generateContent(buildGeminiRequest(model, prompt, schema, task))
  if (response.promptFeedback?.blockReason) throw new AiRefusalError()
  const finish = response.candidates?.[0]?.finishReason
  if (finish === FinishReason.MAX_TOKENS) throw new AiTruncatedError()
  if (finish && BLOCKED.has(finish)) throw new AiRefusalError()
  const parsed = parseModelJson(schema, (response.text ?? '').trim())
  if (parsed === null) throw new AiInvalidOutputError('output did not match the schema')
  return parsed
}

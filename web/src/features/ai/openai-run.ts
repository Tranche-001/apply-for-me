// One structured OpenAI call (used when the OpenAI key is the one picked in web/.env). Same contract as
// runStructured (Claude) and runGeminiStructured: same prompt, same JSON schema, same Zod check, same errors on a
// refusal or a cut-off answer. Uses the Responses API with a strict JSON schema. When the chosen model is
// overloaded it falls back to the next one. The client is passed in, so tests can hand it a fake one.
import OpenAI from 'openai'
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'
import type { z } from 'zod'
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError, isOpenAiApiError } from './errors'
import type { Prompt } from './prompts'
import { strictJsonSchema, type TaskConfig } from './run'
import { parseModelJson } from './schemas'

type JsonSchema = Record<string, unknown>

/**
 * OpenAI's strict mode wants every property listed in `required` (an optional field may still be sent; the Zod
 * check accepts it). The rest of the strict schema is the one Claude and Gemini get.
 */
export function openAiJsonSchema(schema: z.ZodType): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (typeof node !== 'object' || node === null) return node
    const out: JsonSchema = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, k === 'enum' || k === 'required' ? v : walk(v)]))
    if (out.type === 'object' && out.properties && typeof out.properties === 'object') out.required = Object.keys(out.properties)
    return out
  }
  return walk(strictJsonSchema(schema)) as JsonSchema
}

export function buildOpenAiRequest(model: string, prompt: Prompt, schema: z.ZodType, task: TaskConfig): ResponseCreateParamsNonStreaming {
  return {
    model,
    // The rules go in the instructions; your material comes first in the message, so OpenAI's prompt cache can
    // reuse it between calls.
    instructions: prompt.system,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt.context },
          { type: 'input_text', text: prompt.request },
        ],
      },
    ],
    max_output_tokens: task.maxTokens,
    reasoning: { effort: task.effort },
    text: { format: { type: 'json_schema', name: 'output', schema: openAiJsonSchema(schema), strict: true } },
    store: false,
  }
}

/** Worth trying the next model: overloaded or failing (5xx), out of quota (429), or too slow. */
const OVERLOADED = new Set([429, 500, 502, 503, 504])

export function isOpenAiOverloaded(err: unknown): boolean {
  // By class: the SDK names its errors "Error".
  if (err instanceof OpenAI.APIConnectionTimeoutError) return true
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) return true
  return isOpenAiApiError(err) && OVERLOADED.has(err.status)
}

/** Tries each model in order while OpenAI reports it overloaded; any other failure stops right away. */
export async function runOpenAiStructured<T>(client: OpenAI, models: readonly string[], prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T> {
  let lastError: unknown = new Error('no OpenAI model configured')
  for (const [i, model] of models.entries()) {
    try {
      return await runOnce(client, model, prompt, schema, task)
    } catch (err) {
      if (!isOpenAiOverloaded(err)) throw err
      lastError = err
      if (i < models.length - 1) console.warn(`[ai] ${model} is overloaded; trying ${models[i + 1]}`)
    }
  }
  throw lastError
}

type OutputItem = { type: string; content?: { type: string }[] }

async function runOnce<T>(client: OpenAI, model: string, prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T> {
  const response = await client.responses.create(buildOpenAiRequest(model, prompt, schema, task))
  if (response.status === 'incomplete') {
    if (response.incomplete_details?.reason === 'content_filter') throw new AiRefusalError()
    throw new AiTruncatedError()
  }
  const refused = (response.output as OutputItem[]).some((item) => item.type === 'message' && item.content?.some((c) => c.type === 'refusal'))
  if (refused) throw new AiRefusalError()
  const parsed = parseModelJson(schema, (response.output_text ?? '').trim())
  if (parsed === null) throw new AiInvalidOutputError('output did not match the schema')
  return parsed
}

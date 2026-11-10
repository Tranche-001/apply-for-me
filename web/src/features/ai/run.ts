// One structured Claude call: stream (long outputs), adaptive thinking, JSON schema output, server-side
// fallback on a policy decline. The answer is checked for refusal / truncation and validated with Zod.
// The client is passed in, so tests can hand it a fake one.
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError } from './errors'
import { FALLBACK_BETA, MODEL, type Effort } from './model'
import type { Prompt } from './prompts'
import { parseModelJson } from './schemas'

export type TaskConfig = { maxTokens: number; effort: Effort }

type JsonSchema = { [key: string]: unknown }

const KEEP = new Set(['type', 'properties', 'required', 'items', 'anyOf', 'enum', 'description', 'additionalProperties'])

/**
 * The structured-output schema the API enforces: definitions inlined (no $ref), enums kept as real
 * `enum`s, every object closed (additionalProperties: false). We still parse and validate with Zod.
 */
export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (typeof node !== 'object' || node === null) return node
    const out: JsonSchema = {}
    for (const [key, value] of Object.entries(node)) {
      if (!KEEP.has(key)) continue
      if (key === 'properties') out.properties = Object.fromEntries(Object.entries(value as JsonSchema).map(([k, v]) => [k, walk(v)]))
      else out[key] = key === 'enum' || key === 'required' ? value : walk(value)
    }
    if (out.type === 'object') out.additionalProperties = false
    // `type: ["string", "null"]` → `anyOf: [{ type: "string" }, { type: "null" }]`, the documented form.
    if (Array.isArray(out.type)) {
      const { type, enum: allowed, ...rest } = out
      const variants = (type as string[]).map((t) =>
        t === 'null' ? { type: 'null' } : { type: t, ...(Array.isArray(allowed) ? { enum: allowed.filter((v) => v !== null) } : {}) },
      )
      return { ...rest, anyOf: variants }
    }
    return out
  }
  return walk(z.toJSONSchema(schema, { reused: 'inline' })) as JsonSchema
}

export function outputFormat(schema: z.ZodType): { type: 'json_schema'; schema: JsonSchema } {
  return { type: 'json_schema', schema: strictJsonSchema(schema) }
}

/** Haiku has no server-side fallback on a refusal; the bigger models do. */
export const hasServerFallback = (model: string): boolean => !model.startsWith('claude-haiku')

export function buildRequest(prompt: Prompt, schema: z.ZodType, task: TaskConfig, model: string = MODEL) {
  return {
    model,
    max_tokens: task.maxTokens,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: task.effort, format: outputFormat(schema) },
    ...(hasServerFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    // The rules and the user's material are stable between retries, so both are cached.
    system: [{ type: 'text' as const, text: prompt.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: prompt.context, cache_control: { type: 'ephemeral' as const } },
          { type: 'text' as const, text: prompt.request },
        ],
      },
    ],
  }
}

export async function runStructured<T>(client: Anthropic, prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig, model: string = MODEL): Promise<T> {
  const stream = client.beta.messages.stream(buildRequest(prompt, schema, task, model))
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') throw new AiRefusalError()
  if (message.stop_reason === 'max_tokens') throw new AiTruncatedError()
  const text = message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim()
  const parsed = parseModelJson(schema, text)
  if (parsed === null) throw new AiInvalidOutputError('output did not match the schema')
  return parsed
}

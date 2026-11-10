// One structured call to an OpenAI-compatible service (OpenRouter, DeepSeek, Mistral, Groq, xAI or any other
// address you saved a key for). Same contract as the other runners: same prompt, same Zod check, same errors on a
// refusal or a cut-off answer. These services speak Chat Completions, not OpenAI's Responses API. Not all of them
// enforce a JSON schema: when a service rejects `json_schema`, the call is repeated asking for plain JSON with the
// schema written into the instructions, and the Zod check still decides.
import type OpenAI from 'openai'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'
import type { z } from 'zod'
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError, isOpenAiApiError } from './errors'
import { openAiJsonSchema } from './openai-run'
import type { Prompt } from './prompts'
import type { TaskConfig } from './run'
import { parseModelJson } from './schemas'

type Mode = 'schema' | 'json'

export function buildCompatibleRequest(model: string, prompt: Prompt, schema: z.ZodType, task: TaskConfig, mode: Mode): ChatCompletionCreateParamsNonStreaming {
  const jsonSchema = openAiJsonSchema(schema)
  const system =
    mode === 'schema'
      ? prompt.system
      : `${prompt.system}\n\nAnswer with one JSON object only, no other text, matching this JSON schema:\n${JSON.stringify(jsonSchema)}`
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${prompt.context}\n\n${prompt.request}` },
    ],
    // `max_tokens`, not `max_completion_tokens`: the older name is the one every compatible service accepts.
    max_tokens: task.maxTokens,
    response_format:
      mode === 'schema'
        ? { type: 'json_schema', json_schema: { name: 'output', schema: jsonSchema, strict: true } }
        : { type: 'json_object' },
  }
}

/** A 400 or 422 about the response format: the service does not support a JSON schema. */
export function rejectsJsonSchema(err: unknown): boolean {
  if (!isOpenAiApiError(err) || (err.status !== 400 && err.status !== 422)) return false
  return /response_format|response format|json_schema|json schema|structured/i.test(err.message)
}

async function runOnce<T>(client: OpenAI, model: string, prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig, mode: Mode): Promise<T> {
  const completion = await client.chat.completions.create(buildCompatibleRequest(model, prompt, schema, task, mode))
  const choice = completion.choices[0]
  if (!choice) throw new AiInvalidOutputError('no answer')
  if (choice.message.refusal || choice.finish_reason === 'content_filter') throw new AiRefusalError()
  if (choice.finish_reason === 'length') throw new AiTruncatedError()
  const parsed = parseModelJson(schema, (choice.message.content ?? '').trim())
  if (parsed === null) throw new AiInvalidOutputError('output did not match the schema')
  return parsed
}

export async function runCompatibleStructured<T>(client: OpenAI, model: string, prompt: Prompt, schema: z.ZodType<T>, task: TaskConfig): Promise<T> {
  try {
    return await runOnce(client, model, prompt, schema, task, 'schema')
  } catch (err) {
    if (!rejectsJsonSchema(err)) throw err
    console.warn(`[ai] ${model} does not take a JSON schema; asking for plain JSON`)
    return runOnce(client, model, prompt, schema, task, 'json')
  }
}

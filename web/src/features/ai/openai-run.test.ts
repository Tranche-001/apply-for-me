import OpenAI from 'openai'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError, errorLogContext, plainAiError } from './errors'
import { OPENAI_DEFAULT_MODEL, OPENAI_FALLBACK_MODEL } from './model'
import { buildOpenAiRequest, openAiJsonSchema, runOpenAiStructured } from './openai-run'
import type { Prompt } from './prompts'
import { answerOutputSchema } from './schemas'

const PROMPT: Prompt = { system: 'rules', context: 'material', request: 'do it' }
const TASK = { maxTokens: 1000, effort: 'high' as const }
const ANSWER = JSON.stringify({ text: 'An answer.', changes: ['Shorter'] })

type FakeResponse = { status?: string; incomplete_details?: { reason?: string } | null; output_text?: string; output?: unknown[] }

const done = (output_text: string): FakeResponse => ({ status: 'completed', incomplete_details: null, output_text, output: [{ type: 'message', content: [{ type: 'output_text' }] }] })

function fakeClient(...responses: (FakeResponse | Error)[]) {
  const create = vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  })
  return { client: { responses: { create } } as unknown as OpenAI, create }
}

/** What the OpenAI SDK really throws for an HTTP status (its errors are all named "Error", so only the class tells them apart). */
const apiError = (_kind: string, status: number, message = 'error') => OpenAI.APIError.generate(status, { message }, message, new Headers())

describe('buildOpenAiRequest', () => {
  test('instructions, material before the request, strict JSON schema, reasoning effort, output limit, nothing stored', () => {
    const req = buildOpenAiRequest('gpt-6-luna', PROMPT, answerOutputSchema, TASK)
    expect(req).toMatchObject({ model: 'gpt-6-luna', instructions: 'rules', max_output_tokens: 1000, reasoning: { effort: 'high' }, store: false })
    expect(req.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'material' }, { type: 'input_text', text: 'do it' }] }])
    expect(req.text?.format).toMatchObject({ type: 'json_schema', name: 'output', strict: true, schema: { type: 'object', additionalProperties: false } })
  })
})

describe('openAiJsonSchema', () => {
  test('every property is required, also optional ones, at every level (OpenAI strict mode)', () => {
    const schema = z.object({ a: z.string(), b: z.string().optional(), inner: z.array(z.object({ c: z.number().optional() })) })
    const json = openAiJsonSchema(schema) as { required: string[]; properties: { inner: { items: { required: string[] } } } }
    expect(json.required).toEqual(['a', 'b', 'inner'])
    expect(json.properties.inner.items.required).toEqual(['c'])
  })
})

describe('runOpenAiStructured', () => {
  test('returns the parsed output', async () => {
    const { client } = fakeClient(done(ANSWER))
    expect(await runOpenAiStructured(client, [OPENAI_DEFAULT_MODEL], PROMPT, answerOutputSchema, TASK)).toEqual({ text: 'An answer.', changes: ['Shorter'] })
  })

  test('a cut-off answer, a content filter and a refusal become the shared errors', async () => {
    const run = (r: FakeResponse) => runOpenAiStructured(fakeClient(r).client, ['m'], PROMPT, answerOutputSchema, TASK)
    await expect(run({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] })).rejects.toBeInstanceOf(AiTruncatedError)
    await expect(run({ status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] })).rejects.toBeInstanceOf(AiRefusalError)
    await expect(run({ status: 'completed', output_text: '', output: [{ type: 'message', content: [{ type: 'refusal' }] }] })).rejects.toBeInstanceOf(AiRefusalError)
    await expect(run(done('{"nope": 1}'))).rejects.toBeInstanceOf(AiInvalidOutputError)
  })

  test('an overloaded or out-of-quota model hands the call to the fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, create } = fakeClient(apiError('RateLimitError', 429), done(ANSWER))
    await runOpenAiStructured(client, [OPENAI_DEFAULT_MODEL, OPENAI_FALLBACK_MODEL], PROMPT, answerOutputSchema, TASK)
    expect(create.mock.calls.map((c) => (c as unknown as [{ model: string }])[0].model)).toEqual([OPENAI_DEFAULT_MODEL, OPENAI_FALLBACK_MODEL])
  })

  test('a model that times out hands the call to the fallback (the SDK names its timeout error just "Error")', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const timeout = new OpenAI.APIConnectionTimeoutError()
    expect(timeout.name).toBe('Error')
    const { client, create } = fakeClient(timeout, done(ANSWER))
    await runOpenAiStructured(client, ['a', 'b'], PROMPT, answerOutputSchema, TASK)
    expect(create).toHaveBeenCalledTimes(2)
    expect(plainAiError(timeout, 'openai')).toBe('The AI took too long to answer. Nothing was changed; try again.')
  })

  test('a refused key stops at once (another model would not fix it)', async () => {
    const { client, create } = fakeClient(apiError('AuthenticationError', 401), done(ANSWER))
    await expect(runOpenAiStructured(client, ['a', 'b'], PROMPT, answerOutputSchema, TASK)).rejects.toMatchObject({ status: 401 })
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('OpenAI errors in plain words', () => {
  test('names OpenAI, its key and what to do', () => {
    expect(plainAiError(apiError('AuthenticationError', 401), 'openai')).toBe(
      'The OpenAI API key (OPENAI_API_KEY in web/.env) was refused. Check that it is correct and still active.',
    )
    expect(plainAiError(apiError('RateLimitError', 429), 'openai')).toMatch(/quota is used up/)
    expect(plainAiError(apiError('InternalServerError', 503), 'openai')).toBe('The OpenAI API is busy or having trouble. Try again in a moment.')
    expect(plainAiError(apiError('BadRequestError', 400, 'maximum context length exceeded'), 'openai')).toMatch(/too long/)
  })

  test('logs only the class and status', () => {
    expect(errorLogContext(apiError('RateLimitError', 429, 'secret prompt text'))).toEqual({ name: 'OpenAI RateLimitError', status: 429 })
    expect(errorLogContext(new OpenAI.APIConnectionTimeoutError())).toEqual({ name: 'OpenAI APIConnectionTimeoutError', status: null })
    const body = { error: { code: 'rate_limit_exceeded', type: 'tokens', message: 'secret' } }
    const quota = OpenAI.APIError.generate(429, body, 'secret', new Headers())
    expect(errorLogContext(quota)).toEqual({ name: 'OpenAI RateLimitError', status: 429, code: 'rate_limit_exceeded', type: 'tokens' })
  })
})

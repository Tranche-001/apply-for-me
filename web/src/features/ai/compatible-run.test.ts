import OpenAI from 'openai'
import { describe, expect, test, vi } from 'vitest'
import { buildCompatibleRequest, rejectsJsonSchema, runCompatibleStructured } from './compatible-run'
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError, aiMessages, plainAiError } from './errors'
import type { Prompt } from './prompts'
import { buildRequest } from './run'
import { answerOutputSchema } from './schemas'

const PROMPT: Prompt = { system: 'rules', context: 'material', request: 'do it' }
const TASK = { maxTokens: 1000, effort: 'medium' as const }
const ANSWER = JSON.stringify({ text: 'An answer.', changes: ['Shorter'] })

type Choice = { finish_reason: string; message: { content: string | null; refusal?: string | null } }
const reply = (content: string, finish_reason = 'stop'): { choices: Choice[] } => ({ choices: [{ finish_reason, message: { content, refusal: null } }] })

function fakeClient(...responses: ({ choices: Choice[] } | Error)[]) {
  const create = vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  })
  return { client: { chat: { completions: { create } } } as unknown as OpenAI, create }
}

const apiError = (status: number, message: string) => OpenAI.APIError.generate(status, { error: { message } }, message, new Headers())

describe('buildCompatibleRequest', () => {
  test('schema mode: system rules, material and request in one user message, strict JSON schema, output limit', () => {
    const req = buildCompatibleRequest('mistral-large-latest', PROMPT, answerOutputSchema, TASK, 'schema')
    expect(req).toMatchObject({ model: 'mistral-large-latest', max_tokens: 1000, messages: [{ role: 'system', content: 'rules' }, { role: 'user', content: 'material\n\ndo it' }] })
    expect(req.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'output', strict: true } })
  })

  test('json mode: asks for plain JSON and writes the schema into the instructions', () => {
    const req = buildCompatibleRequest('deepseek-chat', PROMPT, answerOutputSchema, TASK, 'json')
    expect(req.response_format).toEqual({ type: 'json_object' })
    expect(req.messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('matching this JSON schema') })
  })
})

describe('runCompatibleStructured', () => {
  test('returns the parsed answer', async () => {
    const { client } = fakeClient(reply(ANSWER))
    await expect(runCompatibleStructured(client, 'm', PROMPT, answerOutputSchema, TASK)).resolves.toEqual({ text: 'An answer.', changes: ['Shorter'] })
  })

  test('a service that rejects json_schema is asked again for plain JSON', async () => {
    const { client, create } = fakeClient(apiError(400, 'response_format json_schema is not supported'), reply(ANSWER))
    await expect(runCompatibleStructured(client, 'm', PROMPT, answerOutputSchema, TASK)).resolves.toMatchObject({ text: 'An answer.' })
    expect(create).toHaveBeenCalledTimes(2)
  })

  test('any other error is passed on without a second call', async () => {
    const { client, create } = fakeClient(apiError(401, 'invalid api key'))
    await expect(runCompatibleStructured(client, 'm', PROMPT, answerOutputSchema, TASK)).rejects.toBeInstanceOf(OpenAI.APIError)
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('refusal, cut-off and wrong shape become the app’s own errors', async () => {
    await expect(runCompatibleStructured(fakeClient({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] }).client, 'm', PROMPT, answerOutputSchema, TASK)).rejects.toBeInstanceOf(AiRefusalError)
    await expect(runCompatibleStructured(fakeClient(reply('{"te', 'length')).client, 'm', PROMPT, answerOutputSchema, TASK)).rejects.toBeInstanceOf(AiTruncatedError)
    await expect(runCompatibleStructured(fakeClient(reply('not json')).client, 'm', PROMPT, answerOutputSchema, TASK)).rejects.toBeInstanceOf(AiInvalidOutputError)
  })

  test('rejectsJsonSchema only matches a 400 about the response format', () => {
    expect(rejectsJsonSchema(apiError(400, 'structured outputs unsupported'))).toBe(true)
    expect(rejectsJsonSchema(apiError(400, 'context too long'))).toBe(false)
    expect(rejectsJsonSchema(new Error('response_format'))).toBe(false)
  })
})

describe('messages name the key in use', () => {
  test('a key from web/.env is named by its variable; a saved key as yours', () => {
    expect(aiMessages('claude').auth).toContain('ANTHROPIC_API_KEY in web/.env')
    expect(aiMessages('claude', 'saved').auth).toContain('Claude key you saved in the AI menu')
    expect(plainAiError(apiError(401, 'bad key'), 'mistral', 'saved')).toContain('Mistral key you saved')
  })
})

describe('Claude request per model', () => {
  test('Opus asks for the server-side fallback; Haiku, which has none, does not', () => {
    expect(buildRequest(PROMPT, answerOutputSchema, TASK)).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default' })
    const haiku = buildRequest(PROMPT, answerOutputSchema, TASK, 'claude-haiku-5-5')
    expect(haiku.model).toBe('claude-haiku-5-5')
    expect(haiku).not.toHaveProperty('fallbacks')
    expect(haiku).not.toHaveProperty('betas')
  })
})

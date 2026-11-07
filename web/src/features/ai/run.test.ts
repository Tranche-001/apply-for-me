import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, test, vi } from 'vitest'
import { aiMessages, AiInvalidOutputError, AiRefusalError, AiTruncatedError, plainAiError } from './errors'
import { FALLBACK_BETA, MODEL } from './model'
import type { Prompt } from './prompts'
import { buildRequest, runStructured, strictJsonSchema } from './run'
import { analysisOutputSchema, answerOutputSchema } from './schemas'

const PROMPT: Prompt = { system: 'rules', context: 'material', request: 'do it' }
const TASK = { maxTokens: 1000, effort: 'medium' as const }

function fakeClient(message: { stop_reason: string; content: { type: string; text?: string }[] }) {
  const stream = vi.fn(() => ({ finalMessage: async () => message }))
  return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream }
}

describe('buildRequest', () => {
  test('uses the default model, adaptive thinking, a JSON schema, fallbacks and caching', () => {
    const req = buildRequest(PROMPT, answerOutputSchema, TASK)
    expect(req.model).toBe(MODEL)
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.thinking).toEqual({ type: 'adaptive' })
    expect(req.output_config.effort).toBe('medium')
    expect(req.output_config.format.type).toBe('json_schema')
    expect(req.output_config.format.schema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(req.betas).toEqual([FALLBACK_BETA])
    expect(req.fallbacks).toBe('default')
    expect(req.system[0]).toMatchObject({ text: 'rules', cache_control: { type: 'ephemeral' } })
    expect(req.messages[0].content[0]).toMatchObject({ text: 'material', cache_control: { type: 'ephemeral' } })
    expect(req.messages[0].content[1]).toEqual({ type: 'text', text: 'do it' })
  })
})

describe('strictJsonSchema', () => {
  test('inlines definitions, keeps enums and closes every object', () => {
    const schema = strictJsonSchema(analysisOutputSchema)
    const text = JSON.stringify(schema)
    expect(text).not.toContain('$ref')
    expect(text).not.toContain('$defs')
    expect(text).not.toContain('$schema')
    const props = schema.properties as Record<string, { items: { properties: Record<string, unknown>; additionalProperties: boolean; required: string[] } }>
    expect(props.requirements.items.properties.status).toMatchObject({ type: 'string', enum: ['covered', 'partial', 'missing'] })
    expect(props.requirements.items.additionalProperties).toBe(false)
    expect(props.drafts.items.required).toEqual(['blockId', 'newBlock', 'fromVersionId', 'title', 'bullets', 'improvedBy', 'matches', 'note'])
    expect(props.drafts.items.properties.blockId).toMatchObject({ anyOf: [{ type: 'string' }, { type: 'null' }] })
  })
})

describe('runStructured', () => {
  test('returns the validated output', async () => {
    const { client, stream } = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: '{"text":"Olá","changes":["Shorter"]}' }] })
    await expect(runStructured(client, PROMPT, answerOutputSchema, TASK)).resolves.toEqual({ text: 'Olá', changes: ['Shorter'] })
    expect(stream).toHaveBeenCalledOnce()
  })

  test('a refusal, a cut-off answer and a wrong shape each raise their own error', async () => {
    await expect(runStructured(fakeClient({ stop_reason: 'refusal', content: [] }).client, PROMPT, answerOutputSchema, TASK)).rejects.toBeInstanceOf(AiRefusalError)
    await expect(
      runStructured(fakeClient({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"te' }] }).client, PROMPT, answerOutputSchema, TASK),
    ).rejects.toBeInstanceOf(AiTruncatedError)
    await expect(
      runStructured(fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"text":1}' }] }).client, PROMPT, answerOutputSchema, TASK),
    ).rejects.toBeInstanceOf(AiInvalidOutputError)
    await expect(
      runStructured(fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }).client, PROMPT, answerOutputSchema, TASK),
    ).rejects.toBeInstanceOf(AiInvalidOutputError)
  })
})

const MESSAGES = aiMessages('claude')

describe('plainAiError (Claude)', () => {
  const headers = new Headers()
  test.each([
    [new AiRefusalError(), MESSAGES.refusal],
    [new AiTruncatedError(), MESSAGES.truncated],
    [new AiInvalidOutputError('x'), MESSAGES.invalid],
    [new Anthropic.AuthenticationError(401, undefined, 'bad key', headers), MESSAGES.auth],
    [new Anthropic.RateLimitError(429, undefined, 'slow down', headers), MESSAGES.rateLimit],
    [new Anthropic.APIConnectionTimeoutError(), MESSAGES.timeout],
    [new Anthropic.APIConnectionError({ message: 'offline' }), MESSAGES.connection],
    [new Anthropic.InternalServerError(500, undefined, 'boom', headers), MESSAGES.busy],
    [new Anthropic.BadRequestError(400, undefined, 'bad', headers), MESSAGES.badRequest],
    [new Error('anything'), MESSAGES.unknown],
  ])('%s → plain words', (err, message) => {
    expect(plainAiError(err, 'claude')).toBe(message)
  })
})

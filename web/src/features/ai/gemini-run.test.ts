import { ApiError, FinishReason, ThinkingLevel, type GoogleGenAI } from '@google/genai'
import { describe, expect, test, vi } from 'vitest'
import { aiMessages, AiInvalidOutputError, AiRefusalError, AiTruncatedError, errorLogContext, plainAiError } from './errors'
import { buildGeminiRequest, isOverloaded, runGeminiStructured } from './gemini-run'
import { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL } from './model'
import type { Prompt } from './prompts'
import { answerOutputSchema } from './schemas'

const PROMPT: Prompt = { system: 'rules', context: 'material', request: 'do it' }
const TASK = { maxTokens: 1000, effort: 'high' as const }

type FakeResponse = { text?: string; candidates?: { finishReason?: string }[]; promptFeedback?: { blockReason?: string } }

function fakeClient(response: FakeResponse) {
  const generateContent = vi.fn(async () => response)
  return { client: { models: { generateContent } } as unknown as GoogleGenAI, generateContent }
}

const run = (response: FakeResponse) => runGeminiStructured(fakeClient(response).client, [GEMINI_DEFAULT_MODEL], PROMPT, answerOutputSchema, TASK)

describe('buildGeminiRequest', () => {
  test('system instruction, material before the request, JSON schema, thinking level and output limit', () => {
    const req = buildGeminiRequest('gemini-3.8-flash', PROMPT, answerOutputSchema, TASK)
    expect(req.model).toBe('gemini-3.8-flash')
    expect(req.contents).toEqual([{ role: 'user', parts: [{ text: 'material' }, { text: 'do it' }] }])
    expect(req.config?.systemInstruction).toBe('rules')
    expect(req.config?.maxOutputTokens).toBe(1000)
    expect(req.config?.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.HIGH })
    expect(req.config?.responseMimeType).toBe('application/json')
    expect(req.config?.responseJsonSchema).toMatchObject({ type: 'object', additionalProperties: false, required: ['text', 'changes'] })
    expect(JSON.stringify(req.config?.responseJsonSchema)).not.toContain('$ref')
  })

  test('effort maps to the matching thinking level', () => {
    expect(buildGeminiRequest('m', PROMPT, answerOutputSchema, { maxTokens: 1, effort: 'medium' }).config?.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.MEDIUM })
    expect(buildGeminiRequest('m', PROMPT, answerOutputSchema, { maxTokens: 1, effort: 'low' }).config?.thinkingConfig).toEqual({ thinkingLevel: ThinkingLevel.LOW })
  })
})

describe('runGeminiStructured', () => {
  test('returns the validated output', async () => {
    const { client, generateContent } = fakeClient({ text: '{"text":"Olá","changes":["Shorter"]}', candidates: [{ finishReason: FinishReason.STOP }] })
    await expect(runGeminiStructured(client, ['gemini-3.8-flash'], PROMPT, answerOutputSchema, TASK)).resolves.toEqual({ text: 'Olá', changes: ['Shorter'] })
    expect(generateContent).toHaveBeenCalledOnce()
  })

  test('a blocked prompt or answer is a refusal', async () => {
    await expect(run({ promptFeedback: { blockReason: 'SAFETY' } })).rejects.toBeInstanceOf(AiRefusalError)
    await expect(run({ text: '', candidates: [{ finishReason: FinishReason.SAFETY }] })).rejects.toBeInstanceOf(AiRefusalError)
    await expect(run({ text: '', candidates: [{ finishReason: FinishReason.PROHIBITED_CONTENT }] })).rejects.toBeInstanceOf(AiRefusalError)
  })

  test('a cut-off answer and a wrong shape each raise their own error', async () => {
    await expect(run({ text: '{"te', candidates: [{ finishReason: FinishReason.MAX_TOKENS }] })).rejects.toBeInstanceOf(AiTruncatedError)
    await expect(run({ text: '{"text":1}', candidates: [{ finishReason: FinishReason.STOP }] })).rejects.toBeInstanceOf(AiInvalidOutputError)
    await expect(run({ text: 'not json', candidates: [{ finishReason: FinishReason.STOP }] })).rejects.toBeInstanceOf(AiInvalidOutputError)
    await expect(run({ candidates: [] })).rejects.toBeInstanceOf(AiInvalidOutputError)
  })
})

describe('fallback model', () => {
  const OK = { text: '{"text":"Olá","changes":[]}', candidates: [{ finishReason: FinishReason.STOP }] }
  const MODELS = [GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL]

  function clientFailingWith(first: unknown) {
    const generateContent = vi.fn(async (req: { model: string }) => {
      if (req.model === GEMINI_DEFAULT_MODEL) throw first
      return OK
    })
    return { client: { models: { generateContent } } as unknown as GoogleGenAI, generateContent }
  }

  test.each([
    ['503 high demand', new ApiError({ status: 503, message: 'This model is currently experiencing high demand.' })],
    ['504 deadline', new ApiError({ status: 504, message: 'Deadline exceeded' })],
    ['429 quota of this model', new ApiError({ status: 429, message: 'You exceeded your current quota' })],
    ['our timeout', Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })],
  ])('%s on the chosen model → the fallback model answers', async (_label, err) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client, generateContent } = clientFailingWith(err)
    await expect(runGeminiStructured(client, MODELS, PROMPT, answerOutputSchema, TASK)).resolves.toEqual({ text: 'Olá', changes: [] })
    expect(generateContent.mock.calls.map(([req]) => req.model)).toEqual(MODELS)
  })

  test('a bad key, no access or a refusal never switches model', async () => {
    for (const err of [new ApiError({ status: 400, message: 'API key not valid' }), new ApiError({ status: 403, message: 'denied' }), new AiRefusalError()]) {
      const { client, generateContent } = clientFailingWith(err)
      await expect(runGeminiStructured(client, MODELS, PROMPT, answerOutputSchema, TASK)).rejects.toBe(err)
      expect(generateContent).toHaveBeenCalledOnce()
    }
  })

  test('every model overloaded → the last error, in plain words', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const busy = new ApiError({ status: 503, message: 'high demand' })
    const generateContent = vi.fn(async () => {
      throw busy
    })
    const client = { models: { generateContent } } as unknown as GoogleGenAI
    const err = await runGeminiStructured(client, MODELS, PROMPT, answerOutputSchema, TASK).catch((e: unknown) => e)
    expect(err).toBe(busy)
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(plainAiError(err, 'gemini')).toBe(aiMessages('gemini').busy)
  })

  test('isOverloaded', () => {
    expect(isOverloaded(new ApiError({ status: 503, message: 'x' }))).toBe(true)
    expect(isOverloaded(new ApiError({ status: 500, message: 'x' }))).toBe(true)
    expect(isOverloaded(new ApiError({ status: 429, message: 'x' }))).toBe(true)
    expect(isOverloaded(new ApiError({ status: 400, message: 'x' }))).toBe(false)
    expect(isOverloaded(new Error('x'))).toBe(false)
  })
})

describe('plainAiError (Gemini)', () => {
  const MESSAGES = aiMessages('gemini')
  const api = (status: number, message = 'x') => new ApiError({ status, message })

  test.each([
    [api(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}'), MESSAGES.auth],
    [api(401), MESSAGES.auth],
    [api(403), MESSAGES.permission],
    [api(404), MESSAGES.permission],
    [api(429), MESSAGES.rateLimit],
    [api(504), MESSAGES.timeout],
    [api(503), MESSAGES.busy],
    [api(400, 'Request contains an invalid argument.'), MESSAGES.badRequest],
    [Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }), MESSAGES.timeout],
    [new TypeError('fetch failed'), MESSAGES.connection],
    [new Error('anything'), MESSAGES.unknown],
  ])('%s → plain words', (err, message) => {
    expect(plainAiError(err, 'gemini')).toBe(message)
  })

  test('messages name Gemini and its key, never Claude', () => {
    expect(MESSAGES.auth).toContain('GEMINI_API_KEY')
    expect(MESSAGES.permission).toContain('Google AI Studio')
    expect(Object.values(MESSAGES).join(' ')).not.toMatch(/Claude|ANTHROPIC/)
  })

  test('only the status is logged, never the message', () => {
    expect(errorLogContext(api(429, 'quota for key AIza…'))).toEqual({ name: 'GeminiApiError', status: 429 })
  })
})

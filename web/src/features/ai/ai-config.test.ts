import { describe, expect, it } from 'vitest'
import { buildPickerView, resolveChoice, type SavedKeyInfo } from './ai-config'
import { detectService, modelName, serviceName } from './catalog'
import { decryptKey, encryptKey, keySecret, lastFour } from './key-crypto'
import { GEMINI_DEFAULT_MODEL, MODEL, OPENAI_DEFAULT_MODEL } from './model'

const claudeSaved: SavedKeyInfo = { service: 'claude', last4: 'a91F', baseUrl: null, model: null }
const mistralSaved: SavedKeyInfo = { service: 'mistral', last4: '7Hd2', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' }

describe('detectService', () => {
  it.each([
    ['sk-ant-api03-abc', 'claude'],
    ['AIzaSyAbc', 'gemini'],
    ['sk-or-v1-abc', 'openrouter'],
    ['gsk_abc', 'groq'],
    ['xai-abc', 'xai'],
    ['sk-proj-abc', 'openai'],
    ['  sk-ant-api03-abc  ', 'claude'],
  ])('reads %s as %s', (key, service) => {
    expect(detectService(key)).toBe(service)
  })

  it('returns null when the key does not say its service', () => {
    expect(detectService('q8Lx2abcdefgh')).toBeNull()
  })
})

describe('names', () => {
  it('names services and built-in models for people', () => {
    expect(serviceName('xai')).toBe('xAI (Grok)')
    expect(serviceName('custom')).toBe('Other service')
    expect(modelName('claude', 'claude-haiku-5-5')).toBe('Claude Haiku 5.5')
    expect(modelName('mistral', 'mistral-large-latest')).toBe('mistral-large-latest')
  })
})

describe('key-crypto', () => {
  const secret = 'a-long-test-secret-0123456789'

  it('encrypts so the stored text holds no part of the key, and decrypts it back', () => {
    const stored = encryptKey('sk-ant-api03-secret-value-a91F', secret, 'claude')
    expect(stored).not.toContain('secret-value')
    expect(decryptKey(stored, secret, 'claude')).toBe('sk-ant-api03-secret-value-a91F')
  })

  it('gives null with another secret, another service or a damaged text', () => {
    const stored = encryptKey('sk-abc', secret, 'openai')
    expect(decryptKey(stored, 'another-secret-0123456789', 'openai')).toBeNull()
    expect(decryptKey(stored, secret, 'mistral')).toBeNull()
    expect(decryptKey('v1:x', secret, 'openai')).toBeNull()
  })

  it('accepts only a secret of 16 characters or more', () => {
    expect(keySecret({ AI_KEYS_SECRET: 'short' })).toBeNull()
    expect(keySecret({})).toBeNull()
    expect(keySecret({ AI_KEYS_SECRET: secret })).toBe(secret)
  })

  it('shows only the last four characters', () => {
    expect(lastFour(' sk-abcdefWXYZ ')).toBe('WXYZ')
  })
})

describe('resolveChoice', () => {
  it('uses the picked model when its service has a key', () => {
    const env = { GEMINI_API_KEY: 'g' }
    expect(resolveChoice(env, [claudeSaved], { service: 'claude', model: 'claude-haiku-5-5' })).toEqual({
      service: 'claude',
      model: 'claude-haiku-5-5',
      source: 'saved',
    })
  })

  it('falls back to web/.env when the picked service lost its key', () => {
    const env = { GEMINI_API_KEY: 'g' }
    expect(resolveChoice(env, [], { service: 'claude', model: MODEL })).toEqual({ service: 'gemini', model: GEMINI_DEFAULT_MODEL, source: 'env' })
  })

  it('keeps AI_PROVIDER and the model named in web/.env when nothing was picked', () => {
    const env = { GEMINI_API_KEY: 'g', OPEN_AI_API_KEY: 'o', AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-6.1-terra' }
    expect(resolveChoice(env, [], null)).toEqual({ service: 'openai', model: 'gpt-6.1-terra', source: 'env' })
  })

  it('prefers a saved key over the one in web/.env for the same service', () => {
    expect(resolveChoice({ ANTHROPIC_API_KEY: 'a' }, [claudeSaved], null)?.source).toBe('saved')
  })

  it('uses the model saved with an OpenAI-compatible key', () => {
    expect(resolveChoice({}, [mistralSaved], { service: 'mistral', model: 'anything' })).toEqual({
      service: 'mistral',
      model: 'mistral-large-latest',
      source: 'saved',
    })
  })

  it('uses the first saved key when web/.env has none', () => {
    expect(resolveChoice({}, [mistralSaved], null)?.service).toBe('mistral')
  })

  it('is null with no key anywhere', () => {
    expect(resolveChoice({}, [], { service: 'claude', model: MODEL })).toBeNull()
  })
})

describe('buildPickerView', () => {
  it('lists the three providers, then your other services, and marks where each key comes from', () => {
    const view = buildPickerView({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }, [claudeSaved, mistralSaved], { service: 'claude', model: MODEL }, true)
    expect(view.groups.map((g) => [g.service, g.source, g.last4])).toEqual([
      ['gemini', 'env', null],
      ['openai', 'env', null],
      ['claude', 'saved', 'a91F'],
      ['mistral', 'saved', '7Hd2'],
    ])
    expect(view.current).toMatchObject({ service: 'claude', modelName: 'Claude Opus 5.5', source: 'saved', last4: 'a91F' })
  })

  it('shows a provider without a key, so its models can ask for one', () => {
    const view = buildPickerView({ GEMINI_API_KEY: 'g' }, [], null, false)
    expect(view.groups.find((g) => g.service === 'claude')?.source).toBeNull()
    expect(view.canSaveKeys).toBe(false)
  })

  it('adds a model named in web/.env that the catalog does not list', () => {
    const view = buildPickerView({ OPENAI_API_KEY: 'o', OPENAI_MODEL: 'gpt-6-experimental' }, [], null, true)
    const openai = view.groups.find((g) => g.service === 'openai')!
    expect(openai.models.map((m) => m.id)).toContain('gpt-6-experimental')
    expect(openai.models.map((m) => m.id)).toContain(OPENAI_DEFAULT_MODEL)
    expect(view.current?.model).toBe('gpt-6-experimental')
  })

  it('has no current model with no key anywhere', () => {
    expect(buildPickerView({}, [], null, true).current).toBeNull()
  })
})

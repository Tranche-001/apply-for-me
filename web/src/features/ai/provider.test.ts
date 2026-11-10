import { describe, expect, test } from 'vitest'
import { pickProvider } from './provider'

describe('pickProvider', () => {
  test('no key: no AI', () => {
    expect(pickProvider({})).toBeNull()
    expect(pickProvider({ ANTHROPIC_API_KEY: '  ', GEMINI_API_KEY: '' })).toBeNull()
  })

  test('one key: that provider', () => {
    expect(pickProvider({ ANTHROPIC_API_KEY: 'sk-ant' })).toBe('claude')
    expect(pickProvider({ GEMINI_API_KEY: 'AIza' })).toBe('gemini')
  })

  test('both keys: Claude, unless AI_PROVIDER says Gemini', () => {
    const both = { ANTHROPIC_API_KEY: 'sk-ant', GEMINI_API_KEY: 'AIza' }
    expect(pickProvider(both)).toBe('claude')
    expect(pickProvider({ ...both, AI_PROVIDER: 'gemini' })).toBe('gemini')
    expect(pickProvider({ ...both, AI_PROVIDER: ' Gemini ' })).toBe('gemini')
    expect(pickProvider({ ...both, AI_PROVIDER: 'claude' })).toBe('claude')
  })

  test('AI_PROVIDER without its own key: no AI (never a silent switch to the other one)', () => {
    expect(pickProvider({ ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'gemini' })).toBeNull()
    expect(pickProvider({ GEMINI_API_KEY: 'AIza', AI_PROVIDER: 'claude' })).toBeNull()
  })

  test('an unknown AI_PROVIDER is ignored', () => {
    expect(pickProvider({ GEMINI_API_KEY: 'AIza', AI_PROVIDER: 'mistral' })).toBe('gemini')
  })

  test('OpenAI: its key (or the OPEN_AI_API_KEY spelling) alone picks it; after Claude and Gemini otherwise', () => {
    expect(pickProvider({ OPENAI_API_KEY: 'sk-1' })).toBe('openai')
    expect(pickProvider({ OPEN_AI_API_KEY: 'sk-1' })).toBe('openai')
    expect(pickProvider({ GEMINI_API_KEY: 'AIza', OPEN_AI_API_KEY: 'sk-1' })).toBe('gemini')
    expect(pickProvider({ GEMINI_API_KEY: 'AIza', OPEN_AI_API_KEY: 'sk-1', AI_PROVIDER: 'openai' })).toBe('openai')
    expect(pickProvider({ GEMINI_API_KEY: 'AIza', AI_PROVIDER: 'openai' })).toBeNull()
  })
})

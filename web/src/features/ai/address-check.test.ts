import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === 'api.mistral.ai') return [{ address: '104.18.1.1', family: 4 }]
    if (host === 'sneaky.example.com') return [{ address: '10.0.0.5', family: 4 }]
    throw new Error('ENOTFOUND')
  }),
}))

const { publicAddressProblem } = await import('./address-check')

describe('publicAddressProblem', () => {
  it('accepts a public https address', async () => {
    expect(await publicAddressProblem('https://api.mistral.ai/v1')).toBeNull()
  })

  it.each(['http://api.mistral.ai/v1', 'https://localhost:5432', 'https://169.254.169.254/latest', 'https://10.0.0.5/v1', 'https://db/v1', 'https://user:pw@api.mistral.ai/v1'])(
    'refuses %s',
    async (url) => {
      expect(await publicAddressProblem(url)).not.toBeNull()
    },
  )

  it('refuses a name that resolves to a private address', async () => {
    expect(await publicAddressProblem('https://sneaky.example.com/v1')).toMatch(/not a local or private one/)
  })

  it('says so when the name does not resolve', async () => {
    expect(await publicAddressProblem('https://nowhere.example.org/v1')).toMatch(/Couldn’t find nowhere.example.org/)
  })
})

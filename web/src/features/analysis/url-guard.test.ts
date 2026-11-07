import { describe, expect, test } from 'vitest'
import { checkUrl, embeddedIPv4, ipv6Groups, isBlockedAddress, URL_ERRORS } from './url-guard'

describe('isBlockedAddress', () => {
  test.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe',
    '2002:7f00:1::1',
    '64:ff9b:1::a00:1',
    '::ffff:0:a00:1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  test.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::6810:84e5', '::ffff:93.184.216.34'])('allows public %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })
})

describe('ipv6 parsing', () => {
  test('expands "::" and a dotted tail', () => {
    expect(ipv6Groups('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304])
    expect(ipv6Groups('2001:db8::1')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 0, 1])
    expect(ipv6Groups('1::2::3')).toBeNull()
  })

  test('finds IPv4 inside mapped and NAT64 addresses only', () => {
    expect(embeddedIPv4(ipv6Groups('::ffff:10.0.0.1')!)).toBe('10.0.0.1')
    expect(embeddedIPv4(ipv6Groups('64:ff9b::808:808')!)).toBe('8.8.8.8')
    expect(embeddedIPv4(ipv6Groups('2606:4700::1')!)).toBeNull()
  })
})

describe('checkUrl', () => {
  test('accepts http and https and adds https to a bare link', () => {
    const a = checkUrl('https://boards.greenhouse.io/acme/jobs/1#apply')
    expect(a.ok && a.url.toString()).toBe('https://boards.greenhouse.io/acme/jobs/1')
    const b = checkUrl('  gupy.io/vagas/123 ')
    expect(b.ok && b.url.toString()).toBe('https://gupy.io/vagas/123')
  })

  test.each([
    ['', URL_ERRORS.empty],
    ['ftp://example.com/job', URL_ERRORS.protocol],
    ['file:///etc/passwd', URL_ERRORS.protocol],
    ['javascript:alert(1)', URL_ERRORS.protocol],
    ['https://user:pass@example.com/', URL_ERRORS.credentials],
    ['https://example.com:8443/', URL_ERRORS.port],
    ['http://localhost:80/', URL_ERRORS.local],
    ['http://intranet/', URL_ERRORS.local],
    ['http://printer.local/', URL_ERRORS.local],
    ['http://metadata.google.internal/', URL_ERRORS.local],
    ['http://127.0.0.1/', URL_ERRORS.local],
    ['http://169.254.169.254/latest/meta-data', URL_ERRORS.local],
    ['http://[::1]/', URL_ERRORS.local],
    ['http://[::ffff:127.0.0.1]/', URL_ERRORS.local],
    ['http://0x7f000001/', URL_ERRORS.local],
    ['http://2130706433/', URL_ERRORS.local],
    ['https://exa mple.com', URL_ERRORS.invalid],
  ])('refuses %j', (raw, error) => {
    expect(checkUrl(raw)).toEqual({ ok: false, error })
  })

  test('the allowed ports can be widened (tests only)', () => {
    expect(checkUrl('http://jobs.test:4321/x', new Set(['4321'])).ok).toBe(true)
  })
})

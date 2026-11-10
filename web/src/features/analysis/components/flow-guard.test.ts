import { describe, expect, it, vi } from 'vitest'
import { RELOAD, OFFLINE, guardFlow, problemFor } from './flow-guard'

const staleAction = () => new Error('Server Action "7f3a" was not found on the server.')

describe('problemFor', () => {
  it('asks for a reload when the tab calls a server action from an older build', () => {
    expect(problemFor(staleAction())).toBe(RELOAD)
    expect(problemFor(new Error('An unexpected response was received from the server.'))).toBe(RELOAD)
  })

  it('reports the app as unreachable for any other thrown error', () => {
    expect(problemFor(new TypeError('Failed to fetch'))).toBe(OFFLINE)
    expect(problemFor('boom')).toBe(OFFLINE)
  })
})

describe('guardFlow', () => {
  it('runs the flow and reports nothing when it resolves', async () => {
    const onThrow = vi.fn()
    const flow = vi.fn(async () => undefined)
    await guardFlow(flow, onThrow)()
    expect(flow).toHaveBeenCalledOnce()
    expect(onThrow).not.toHaveBeenCalled()
  })

  it('hands a rejected flow to onThrow instead of leaving it unhandled', async () => {
    const onThrow = vi.fn()
    const err = staleAction()
    await guardFlow(async () => { throw err }, onThrow)()
    expect(onThrow).toHaveBeenCalledWith(err)
  })

  it('hands a synchronous throw to onThrow too', async () => {
    const onThrow = vi.fn()
    const err = new Error('sync')
    await guardFlow(() => { throw err }, onThrow)()
    expect(onThrow).toHaveBeenCalledWith(err)
  })
})

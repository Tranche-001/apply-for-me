// Every analysis flow (and every Retry of one) ends idle: a thrown server action never leaves a spinner up.

export const OFFLINE = 'Couldn’t reach the app. Check that it is running, then try again.'
export const RELOAD = 'The app was updated since this page opened. Reload the page, then try again.'

/** A tab opened before the app was rebuilt calls server actions that no longer exist. */
const reloadNeeded = (err: unknown): boolean =>
  err instanceof Error && /server action|older or newer deployment|unexpected response/i.test(err.message)

/** The message shown when a flow throws instead of returning an error. */
export const problemFor = (err: unknown): string => (reloadNeeded(err) ? RELOAD : OFFLINE)

/** Runs a flow; a throw (sync or async) goes to onThrow instead of becoming an unhandled rejection. */
export const guardFlow =
  <A extends unknown[]>(fn: (...args: A) => Promise<void> | void, onThrow: (err: unknown) => void) =>
  async (...args: A): Promise<void> => {
    try {
      await fn(...args)
    } catch (err) {
      onThrow(err)
    }
  }

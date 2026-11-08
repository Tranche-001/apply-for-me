// Fallback reader for pages drawn by JavaScript: opens the link in a headless Chromium on the server and reads the text.
// Every request the page makes goes through decideRequest (SSRF guard, render-guard.ts). Never logs page text.
import 'server-only'
import { chromium, type Frame, type Page } from 'playwright-core'
import { jobPostingFromJsonLd, MAX_POSTING_CHARS, MIN_POSTING_CHARS } from './html-text'
import { decideRequest, postingBrowserPath } from './render-guard'
import { checkUrl } from './url-guard'

export const RENDER_BUDGET_MS = 20_000
export const RENDER_WAIT_MS = 12_000
const POLL_MS = 500
const SETTLE_MS = 1_000
const BROWSER_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']

export type RenderFailure = 'no-browser' | 'not-allowed' | 'timeout' | 'failed'
export type RenderResult = { ok: true; url: string; title: string | null; text: string } | { ok: false; reason: RenderFailure; message: string }

/** Visible text of a frame, empty when it can't be read (navigated away, cross-process, detached). */
async function frameText(frame: Frame): Promise<string> {
  try {
    return (await frame.evaluate(() => document.body?.innerText ?? '')).trim()
  } catch {
    return ''
  }
}

/** The page's text plus the text of its embedded frames (a job board embed, for instance). */
async function pageText(page: Page): Promise<string> {
  const parts = await Promise.all(page.frames().map(frameText))
  return parts.filter(Boolean).join('\n\n')
}

/** Polls until there's enough text or the wait runs out; then lets late content settle and reads once more. */
async function waitForText(page: Page, deadline: number): Promise<string> {
  let text = await pageText(page)
  while (text.length < MIN_POSTING_CHARS && Date.now() < deadline) {
    await page.waitForTimeout(POLL_MS)
    text = await pageText(page)
  }
  if (text.length >= MIN_POSTING_CHARS) {
    await page.waitForTimeout(SETTLE_MS)
    text = await pageText(page)
  }
  return text
}

export async function renderPosting(rawUrl: string): Promise<RenderResult> {
  const check = checkUrl(rawUrl)
  if (!check.ok) return { ok: false, reason: 'not-allowed', message: check.error }
  const executablePath = postingBrowserPath()
  if (!executablePath) return { ok: false, reason: 'no-browser', message: 'No browser is installed on the server to read this page.' }

  const started = Date.now()
  const budgetLeft = () => Math.max(1_000, RENDER_BUDGET_MS - (Date.now() - started))
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    browser = await chromium.launch({ executablePath, headless: true, args: BROWSER_ARGS, timeout: 10_000 })
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'pt-BR', acceptDownloads: false })
    const page = await context.newPage()
    page.setDefaultTimeout(RENDER_BUDGET_MS)
    await page.route('**/*', async (route) => {
      const request = route.request()
      const decision = await decideRequest(request.url(), request.resourceType())
      if (decision.allow) await route.continue()
      else await route.abort('blockedbyclient')
    })
    await page.goto(check.url.toString(), { waitUntil: 'domcontentloaded', timeout: budgetLeft() })
    const deadline = Math.min(started + RENDER_BUDGET_MS - SETTLE_MS, Date.now() + RENDER_WAIT_MS)
    let text = await waitForText(page, deadline)
    if (text.length < MIN_POSTING_CHARS) {
      const fromJsonLd = jobPostingFromJsonLd(await page.content())
      if (fromJsonLd) text = fromJsonLd.text
    }
    const title = (await page.title()).trim() || null
    return { ok: true, url: page.url(), title, text: text.slice(0, MAX_POSTING_CHARS) }
  } catch (err) {
    const timedOut = (err as Error)?.name === 'TimeoutError'
    return timedOut
      ? { ok: false, reason: 'timeout', message: 'The page took too long to show its content.' }
      : { ok: false, reason: 'failed', message: 'The browser could not read this page.' }
  } finally {
    await browser?.close().catch(() => undefined)
  }
}

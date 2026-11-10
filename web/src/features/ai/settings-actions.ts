'use server'

// The nav's AI menu: pick a model, test a key, save it (encrypted), remove it. Keys arrive here once, are tested
// with one tiny call and stored encrypted; they never go back to the browser. Errors are plain words (H9).
import { z } from 'zod'
import { db } from '@/lib/db'
import { defaultModel, keySource, resolveChoice } from './ai-config'
import { publicAddressProblem } from './address-check'
import { BUILT_IN_MODELS, COMPATIBLE_SERVICES, detectService, isBuiltIn, isServiceId, modelName, serviceName, type ServiceId } from './catalog'
import { probeRunner } from './client'
import { errorLogContext, plainAiError } from './errors'
import { encryptKey, keySecret, lastFour } from './key-crypto'
import { fail, invalidInput, ok, type ActionResult } from './result'
import { CHOICE_ID, type AiTarget } from './settings'

const NO_SECRET =
  'To save keys, add AI_KEYS_SECRET to web/.env (any random text of 16 characters or more), then restart the app. Keys in web/.env keep working.'

const service = z.string().refine(isServiceId, 'is not a service the app knows')
const model = z.string().trim().min(1, 'is missing').max(120, 'is too long')

/** https only: the server sends your key to this address. */
const baseUrl = z
  .string()
  .trim()
  .max(300, 'is too long')
  .url('is not a web address')
  .refine((u) => u.startsWith('https://'), 'must start with https://')

const keyInput = z.object({
  key: z.string().trim().min(8, 'looks too short').max(400, 'looks too long').regex(/^\S+$/, 'must not contain spaces'),
  service: service.optional(),
  baseUrl: baseUrl.optional(),
  model: model.optional(),
})

export type KeyInput = z.input<typeof keyInput>

export type KeyTestResult = { service: ServiceId; serviceName: string; model: string; modelName: string; ms: number }

/** Which service, address and model a pasted key goes with; a plain-language problem otherwise. */
function targetFor(input: z.output<typeof keyInput>): AiTarget | string {
  const svc = (input.service as ServiceId | undefined) ?? detectService(input.key)
  if (!svc) return 'The app can’t tell which service this key is from. Choose the service.'
  if (isBuiltIn(svc)) {
    const wanted = input.model && BUILT_IN_MODELS[svc].some((m) => m.id === input.model) ? input.model : BUILT_IN_MODELS[svc][0].id
    return { service: svc, model: wanted, key: input.key, baseUrl: null, source: 'saved' }
  }
  const address = input.baseUrl || COMPATIBLE_SERVICES[svc].url
  if (!address) return 'Add the service’s API address (it starts with https://).'
  if (!input.model) return `Add the model name, as ${serviceName(svc)} writes it.`
  return { service: svc, model: input.model, key: input.key, baseUrl: address, source: 'saved' }
}

const probeSchema = z.object({ ok: z.boolean() })
const PROBE_PROMPT = {
  system: 'You check that an API key works. Answer with the JSON object the schema asks for.',
  context: 'This is a connection test from apply-for-me.',
  request: 'Set "ok" to true.',
}

/** One tiny structured call: proves the key works and that the model can return the app's structured format. */
async function probe(target: AiTarget): Promise<ActionResult<KeyTestResult>> {
  if (target.baseUrl) {
    const problem = await publicAddressProblem(target.baseUrl)
    if (problem) return fail(problem)
  }
  const started = Date.now()
  try {
    await probeRunner(target).run(PROBE_PROMPT, probeSchema, { maxTokens: 2_000, effort: 'low' })
  } catch (err) {
    console.error('[ai] key test failed', { service: target.service, ...errorLogContext(err) })
    return fail(plainAiError(err, target.service, 'saved'))
  }
  return ok({ service: target.service, serviceName: serviceName(target.service), model: target.model, modelName: modelName(target.service, target.model), ms: Date.now() - started })
}

/** "Test": checks a key without saving it. */
export async function testAiKey(input: KeyInput): Promise<ActionResult<KeyTestResult>> {
  const parsed = keyInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const target = targetFor(parsed.data)
  if (typeof target === 'string') return fail(target)
  return probe(target)
}

/** "Save and use": tests the key again, stores it encrypted and makes its model the one the app uses. */
export async function saveAiKey(input: KeyInput): Promise<ActionResult<KeyTestResult>> {
  const parsed = keyInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const secret = keySecret()
  if (!secret) return fail(NO_SECRET)
  const target = targetFor(parsed.data)
  if (typeof target === 'string') return fail(target)
  const tested = await probe(target)
  if (!tested.ok) return tested
  const row = { cipher: encryptKey(target.key, secret, target.service), last4: lastFour(target.key), baseUrl: target.baseUrl, model: isBuiltIn(target.service) ? null : target.model }
  try {
    await db.$transaction([
      db.aiKey.upsert({ where: { service: target.service }, create: { service: target.service, ...row }, update: row }),
      db.aiChoice.upsert({ where: { id: CHOICE_ID }, create: { id: CHOICE_ID, service: target.service, model: target.model }, update: { service: target.service, model: target.model } }),
    ])
  } catch (err) {
    console.error('[ai] saving a key failed', errorLogContext(err))
    return fail('The key works, but it couldn’t be saved. Try again.')
  }
  return tested
}

const chooseInput = z.object({ service, model })

/** Picks a model from the menu. Its service must already have a key (saved here or in web/.env). */
export async function chooseAiModel(input: { service: string; model: string }): Promise<ActionResult<{ modelName: string }>> {
  const parsed = chooseInput.safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const svc = parsed.data.service as ServiceId
  if (isBuiltIn(svc) && !BUILT_IN_MODELS[svc].some((m) => m.id === parsed.data.model) && parsed.data.model !== defaultModel(svc, process.env)) {
    return fail(`${parsed.data.model} is not a ${serviceName(svc)} model the app offers.`)
  }
  try {
    const saved = await db.aiKey.findMany({ select: { service: true, last4: true, baseUrl: true, model: true } })
    const keys = saved.filter((k) => isServiceId(k.service)).map((k) => ({ ...k, service: k.service as ServiceId }))
    if (!keySource(svc, process.env, keys)) return fail(`Add a ${serviceName(svc)} key first.`)
    await db.aiChoice.upsert({ where: { id: CHOICE_ID }, create: { id: CHOICE_ID, service: svc, model: parsed.data.model }, update: { service: svc, model: parsed.data.model } })
  } catch (err) {
    console.error('[ai] choosing a model failed', errorLogContext(err))
    return fail('The model couldn’t be changed. Try again.')
  }
  return ok({ modelName: modelName(svc, parsed.data.model) })
}

/** Removes a saved key. If its model was in use, the app goes back to the next AI it has a key for. */
export async function removeAiKey(input: { service: string }): Promise<ActionResult<{ nowUsing: string | null }>> {
  const parsed = z.object({ service }).safeParse(input)
  if (!parsed.success) return fail(invalidInput(parsed.error))
  const svc = parsed.data.service as ServiceId
  try {
    const rest = await db.$transaction(async (tx) => {
      await tx.aiKey.deleteMany({ where: { service: svc } })
      // The choice stays only when web/.env still has a key for that service.
      if (!(isBuiltIn(svc) && keySource(svc, process.env, []))) await tx.aiChoice.deleteMany({ where: { id: CHOICE_ID, service: svc } })
      return tx.aiKey.findMany({ orderBy: { createdAt: 'asc' }, select: { service: true, last4: true, baseUrl: true, model: true } })
    })
    const keys = rest.filter((k) => isServiceId(k.service)).map((k) => ({ ...k, service: k.service as ServiceId }))
    const next = resolveChoice(process.env, keys, null)
    return ok({ nowUsing: next ? modelName(next.service, next.model) : null })
  } catch (err) {
    console.error('[ai] removing a key failed', errorLogContext(err))
    return fail('The key couldn’t be removed. Try again.')
  }
}

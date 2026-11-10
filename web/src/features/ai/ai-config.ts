// Which AI answers: the model picked in the nav (saved in the database) when its service has a key, else the
// provider web/.env picks, else the first key you saved. Also what the nav's AI menu shows. Pure: no database,
// no SDKs, no key values, so tests can cover every case.
import {
  BUILT_IN_IDS,
  BUILT_IN_MODELS,
  isBuiltIn,
  modelName,
  serviceName,
  type BuiltInId,
  type CatalogModel,
  type ServiceId,
} from './catalog'
import { GEMINI_DEFAULT_MODEL, MODEL, OPENAI_DEFAULT_MODEL } from './model'
import { pickProvider, providerKey } from './provider'

type Env = Partial<Record<string, string | undefined>>

/** A key saved from the nav, as far as anyone may see it (the key itself stays encrypted). */
export type SavedKeyInfo = { service: ServiceId; last4: string; baseUrl: string | null; model: string | null }

export type Choice = { service: ServiceId; model: string } | null

export type KeySource = 'saved' | 'env'

export type ResolvedChoice = { service: ServiceId; model: string; source: KeySource }

/** A built-in provider's model when nothing was picked: the one web/.env names, else the app's default. */
export function defaultModel(service: BuiltInId, env: Env): string {
  if (service === 'gemini') return env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL
  if (service === 'openai') return env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL
  return MODEL
}

/** Where the key for a service comes from: a key you saved wins over web/.env. */
export function keySource(service: ServiceId, env: Env, saved: readonly SavedKeyInfo[]): KeySource | null {
  if (saved.some((k) => k.service === service)) return 'saved'
  if (isBuiltIn(service) && providerKey(env, service)) return 'env'
  return null
}

/** The model for a service with a key: for an OpenAI-compatible service, the one saved with its key. */
function modelFor(service: ServiceId, wanted: string | null, env: Env, saved: readonly SavedKeyInfo[]): string | null {
  if (isBuiltIn(service)) return wanted || defaultModel(service, env)
  return saved.find((k) => k.service === service)?.model ?? null
}

export function resolveChoice(env: Env, saved: readonly SavedKeyInfo[], choice: Choice): ResolvedChoice | null {
  const attempt = (service: ServiceId, wanted: string | null): ResolvedChoice | null => {
    const source = keySource(service, env, saved)
    const model = source && modelFor(service, wanted, env, saved)
    return source && model ? { service, model, source } : null
  }
  if (choice) {
    const picked = attempt(choice.service, choice.model)
    if (picked) return picked
  }
  const fromEnv = pickProvider(env)
  if (fromEnv) return attempt(fromEnv, null)
  for (const key of saved) {
    const found = attempt(key.service, null)
    if (found) return found
  }
  return null
}

export type PickerGroup = {
  service: ServiceId
  name: string
  source: KeySource | null
  last4: string | null
  models: readonly CatalogModel[]
}

export type PickerCurrent = { service: ServiceId; model: string; modelName: string; serviceName: string; source: KeySource; last4: string | null }

/** Everything the nav's AI menu shows. Never holds a key, only its last four characters. */
export type PickerView = { current: PickerCurrent | null; groups: readonly PickerGroup[]; canSaveKeys: boolean }

const envModel = (id: string): CatalogModel => ({ id, name: id, note: 'Set in web/.env.', tag: 'own' })

export function buildPickerView(env: Env, saved: readonly SavedKeyInfo[], choice: Choice, canSaveKeys: boolean): PickerView {
  const resolved = resolveChoice(env, saved, choice)
  const last4Of = (service: ServiceId) => saved.find((k) => k.service === service)?.last4 ?? null
  const builtIn = BUILT_IN_IDS.map((service): PickerGroup => {
    const catalog = BUILT_IN_MODELS[service]
    // A model named in web/.env (GEMINI_MODEL, OPENAI_MODEL) that the catalog doesn't list still shows, so it can be picked again.
    const extra = [defaultModel(service, env), resolved?.service === service ? resolved.model : null]
      .filter((id): id is string => Boolean(id) && !catalog.some((m) => m.id === id))
      .filter((id, i, all) => all.indexOf(id) === i)
    return { service, name: serviceName(service), source: keySource(service, env, saved), last4: last4Of(service), models: [...catalog, ...extra.map(envModel)] }
  })
  const compatible = saved
    .filter((k) => !isBuiltIn(k.service) && k.model)
    .map((k): PickerGroup => ({
      service: k.service,
      name: serviceName(k.service),
      source: 'saved',
      last4: k.last4,
      models: [{ id: k.model!, name: k.model!, note: `Your model, through ${serviceName(k.service)}’s OpenAI-compatible API.`, tag: 'own' }],
    }))
  const current = resolved && {
    ...resolved,
    modelName: modelName(resolved.service, resolved.model),
    serviceName: serviceName(resolved.service),
    last4: resolved.source === 'saved' ? last4Of(resolved.service) : null,
  }
  return { current, groups: [...builtIn, ...compatible], canSaveKeys }
}

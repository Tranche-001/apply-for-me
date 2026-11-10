// Your own AI keys are stored encrypted: AES-256-GCM with a key derived from AI_KEYS_SECRET (web/.env).
// Without that secret no key can be saved or read back, and the nav says how to add it.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const VERSION = 'v1'
const MIN_SECRET_LENGTH = 16

/** The secret from the environment, or null when it is missing or too short to be safe. */
export function keySecret(env: Partial<Record<string, string | undefined>> = process.env): string | null {
  const value = env.AI_KEYS_SECRET?.trim()
  return value && value.length >= MIN_SECRET_LENGTH ? value : null
}

const SALT = 'apply-for-me/ai-keys/v1'
const TAG_LENGTH = 16
const derived = new Map<string, Buffer>()

/** scrypt, so a short human-chosen secret is slow to guess; derived once per secret per process. */
function derive(secret: string): Buffer {
  let key = derived.get(secret)
  if (!key) {
    key = scryptSync(secret, SALT, 32)
    derived.set(secret, key)
  }
  return key
}

/**
 * "v1:<iv>:<tag>:<data>", each part base64. A new random IV every time. The service is bound in as associated data,
 * so a stored key only decrypts under the service it was saved for.
 */
export function encryptKey(plain: string, secret: string, service: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derive(secret), iv, { authTagLength: TAG_LENGTH })
  cipher.setAAD(Buffer.from(service, 'utf8'))
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

/** The key back, or null when the secret changed or the text was tampered with. */
export function decryptKey(stored: string, secret: string, service: string): string | null {
  const [version, iv, tag, data] = stored.split(':')
  if (version !== VERSION || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', derive(secret), Buffer.from(iv, 'base64'), { authTagLength: TAG_LENGTH })
    decipher.setAAD(Buffer.from(service, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** What the screen may show of a key. */
export const lastFour = (key: string): string => key.trim().slice(-4)

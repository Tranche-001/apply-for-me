// Plain-language messages for database failures in Server Functions (H9). Pure: reads Prisma's error code.

export const DB_MESSAGES = {
  gone: 'This was deleted, maybe in another tab. Reload the page.',
  duplicate: 'That already exists. Pick another name.',
  down: 'Couldn’t reach the database. Is it running? (docker compose up -d db)',
  unknown: 'Couldn’t save that. Your text is still here; try again.',
} as const

export function plainDbError(err: unknown, duplicate: string = DB_MESSAGES.duplicate): string {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : ''
  const name = err instanceof Error ? err.name : ''
  if (code === 'P2025' || code === 'P2003' || (err instanceof Error && err.message === 'block-missing')) return DB_MESSAGES.gone
  if (code === 'P2002') return duplicate
  if (code === 'P1001' || code === 'P1002' || code === 'P1017' || name === 'PrismaClientInitializationError') return DB_MESSAGES.down
  return DB_MESSAGES.unknown
}

/** What may be logged: the error's class and code, never the user's text. */
export function dbLogContext(err: unknown): Record<string, unknown> {
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : null
  return { name: err instanceof Error ? err.name : typeof err, code }
}

import 'server-only'
import { PrismaClient } from '@prisma/client'

// One client per server process; reused across hot reloads in development.
// Job.analysis (the saved Job analysis session, up to ~300 KB) is left out of every Job query unless a
// query asks for it, so lists of jobs stay light.
const makeClient = () => new PrismaClient({ omit: { job: { analysis: true } } })
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof makeClient> }

export const db = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

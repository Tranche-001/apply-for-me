# Architecture — apply-for-me

Personal app: Next.js 16 (App Router, Cache Components) + PostgreSQL 17 (Docker) + Prisma 6 + Claude API or Gemini API (your choice of key).
Approved design: the canvas at https://claude.ai/artifact/JzpPHxkVWjxFGsgHbAFbaC (screens as `.dc.html` files).
Design rules: `docs/design-principles.md` (heuristics H1–H10, principles P1–P4, decision log).

## Run it

```bash
docker compose up -d db          # Postgres on localhost:5432
cd web && cp .env.example .env   # add ANTHROPIC_API_KEY or GEMINI_API_KEY
npm install && npm run db:migrate && npm run db:seed
npm run dev                      # http://localhost:3000
```

Everything in Docker: `docker compose up -d --build` (app on :3000, migrations run on start). Compose reads the key from a `.env` next to `docker-compose.yml` (`ANTHROPIC_API_KEY=...` or `GEMINI_API_KEY=...`, git-ignored) or from your shell; to reuse `web/.env` instead: `docker compose --env-file web/.env up -d --build`. Keys are read at request time, so changing one needs a restart, not a rebuild.

Gemini: the default model is gemini-3.8-flash (free tier). When Google answers 429 (free-tier quotas are per model) or 5xx, or the 2-minute attempt runs out, the same call goes to gemini-3.6-flash once (logged as `[ai] … is overloaded; trying …`); a bad key, no access or a blocked answer is shown as is.

One-file prototype (no server, data in the browser): `prototype/apply-for-me.html`.

## Layout

```
web/
  prisma/schema.prisma      data model (Experience, Block → Version → Bullet, Job → JobLink/Cv/CvItem, profile, behavioral, rules)
  prisma/seed.ts            sample data = your real CV text (seed-data.json), word for word
  src/app/<route>/page.tsx  one route per screen: compose, experiences, behavioral, behavioral/interview, jobs, analyze, preferences, blocks, profile
  src/features/<feature>/   queries.ts (server-only reads), actions.ts ('use server' writes), components/*.tsx, *.test.ts
  src/features/ai/          AI calls (Claude: run.ts, Gemini: gemini-run.ts, picked in provider.ts); types.ts holds the shared result types
  src/components/           shared UI (nav, primitives)
  src/lib/db.ts             the Prisma client (server only)
```

## Conventions

- **Reads**: Server Components call `features/<f>/queries.ts`. Data is per user and changes often, so no `'use cache'`; wrap each data component in `<Suspense>` (Cache Components requires it for uncached reads).
- **Writes**: Server Functions in `features/<f>/actions.ts` (`'use server'`). Validate every input with Zod, return `{ ok: true, data } | { ok: false, error }` (plain-language error), call `refresh()` from `next/cache` after a successful write.
- **Interactivity**: Client Components get serializable props; use `useOptimistic` + `useTransition` for instant feedback; text fields autosave after a short pause and show "Saving… / Saved".
- **Styling**: tokens in `src/app/globals.css` (same colors, fonts and sizes as the canvas); Tailwind utilities for layout.
- **AI**: only on the server. `provider.ts` picks Claude (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`) or Gemini (`@google/genai`, `GEMINI_API_KEY`, model `GEMINI_MODEL`, default gemini-3.8-flash); with both keys Claude wins unless `AI_PROVIDER=gemini`. Both runners take the same prompt and Zod schema and raise the same errors, so actions call `getAi().run(...)` and never care which. The nav status is rendered per request (`components/ai-status.tsx`), so a key added after the build shows up. Never invent facts: unknowns become questions or `[brackets]`; results are drafts the user keeps, edits or discards.
- **Tests**: Vitest for logic (`npm test`): CV pagination and fit, link parsing, prompt building, validation.
- **Secrets / privacy**: `.env` and the CV folder are git-ignored. Never log CV text or the API key.

## Next.js 16 notes

Read `web/node_modules/next/dist/docs/` before using an API (this version differs from older Next.js): `refresh()` and `updateTag()` live in `next/cache`; `LayoutProps<'/route'>` / `PageProps<'/route'>` are global types; `params` and `searchParams` are promises.

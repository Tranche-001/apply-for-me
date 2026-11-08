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
- **Reading postings**: `fetch-posting.ts` reads a link with SSRF guards; when the page shows no job text (`no-text`, typically JavaScript-drawn career sites) `read-posting.ts` falls back to `render-posting.ts`, a headless Chromium (`playwright-core`, binary from `POSTING_BROWSER_PATH`, installed in the Docker image) whose every request passes `render-guard.ts` (http/https, ports 80/443, public addresses only; images/fonts/media/websockets aborted), 20 s budget; without a browser or text the paste-the-text message stays.
- **Job analysis** (`/analyze`, `features/analysis/`): the pipeline state is one `AnalysisSession` (pure transitions in `session-state.ts`), autosaved as JSON in `Job.analysis` and validated on save and load (`session.ts`); `src/lib/db.ts` omits that column from every Job query unless one asks for it. The AI's quotes and matched words are checked against the posting and the bullets before the client sees them (`ai/postprocess.ts`). The screen's CSS is the approved prototype's (`prototype/job-analysis-v2.html`), ported to `components/analysis.module.css` and picked with `c('a-pop ans-pop')`; CSS-module rules also beat the unlayered element rules in `globals.css`.
- **Starting an analysis** (`startFromPosting` → `StartResult` in `analysis/start-types.ts`): the links are read (`read-posting.ts` returns each link's text in `reads`); when 2+ texts mostly repeat each other (`overlap.ts`, pure) the result is `overlap` and nothing is asked of the AI until `continueFromLinks` gets the user's Same job / Different jobs with the texts sent back (Zod-checked, links re-checked with `checkUrl` and required to be among the typed ones). Then `readPostingJobs` (`ai/posting-jobs.ts`) says which jobs or tracks the text holds: one starts the job; more give `split` ("Which job?"). Tracks: each track's text is the posting minus the other tracks' parts (a track may have several parts, `moreSections`), so it keeps the shared part (capped at 12,000 characters); every part is located in the real text, never taken from the AI.
- **Profile as evidence**: `analyzeJob` loads the profile into the analysis prompt (`<profile>` fence, items `e1`/`s1`/`a1` from `ai/profile-evidence.ts`); `finalizeAnalysis` keeps a profile match only when its item and requirement exist and each phrase is in that item word for word, then marks a requirement the profile shows in full as covered. The evidence is saved in the session as `analysis.profile` (optional, so older sessions still load) and counts as Met on review (`coverage.ts`).
- **Block order and role titles**: the analysis output has `order` (the CV's blocks, by block key: a library block's id, `new:<name>` for a new block, `analysis/block-key.ts`) and `roleTitles` (per experience block, a title from the job's role); `ai/cv-order.ts` keeps only blocks of this CV, each once, and drops a title for a project or one with a seniority word the job's role lacks. Both are optional in the session (older sessions keep the library order). `compositionForReview` sorts each section by `order` (`inOrder`: unknown keys ignored, unnamed blocks after, in library order). The pick per block (`AnalysisSession.titles`, optional; none = "You have") is pure in `analysis/role-titles.ts`: `roleTitleRows` for the card, `libraryWithTitles` for the page, `titlesForSave` for Save. `saveAnalysisCv` takes `retitled` (as-is versions only): `saveTitleForJob` (`ai/library-writes.ts`) copies the version with the title as a version for this job, or reuses one already made for it; the source version never changes.
- **Arranging the review CV** (drag, Swap, Move to, One section): the session's optional `arrangement` (`order` = every block key in your order as one list, `swappedIn` = left-out version ids, `swappedOut` = block keys, `sections` = block key → section on this CV, `oneSection`); old sessions parse without it. `cv-draft.ts` `reviewRows` builds the CV's rows (draft, as-is, or swapped-in left-out version; each with `section` on this CV and `home` in the library) and `compositionOfRows` the composition; pure transitions in `analysis/arrangement.ts` (`reslot` puts one section's new order back in the whole list, `swapBlock`, `moveToSection`, `resetArrangement`). The card (`components/review-order-card.tsx`, drag in `use-row-drag.ts`, menu in `swap-menu.tsx`) calls `review-order-actions.ts`, which moves with Compose's `moveBy` / `moveTo` on the composition, only inside a section. One section is `Composition.oneSection` (rows kept in the first section): `sectionsFor` prints one section named `ONE_SECTION_NAME`, and it is saved as `Cv.oneSection` (migration `20261108180000_cv_one_section`, default false = two sections) with the items numbered in print order. Moving a block never touches `Block.section`.
- **Preference rules in an existing database**: rules added after the first seed go in `seed-data.json` and in a migration that inserts each one only when no rule has its text (`20261108120000_order_and_title_rules`), at the end of its group.
- **Tests**: Vitest for logic (`npm test`): CV pagination and fit, link parsing, prompt building, validation.
- **Secrets / privacy**: `.env` and the CV folder are git-ignored. Never log CV text or the API key.

## Next.js 16 notes

Read `web/node_modules/next/dist/docs/` before using an API (this version differs from older Next.js): `refresh()` and `updateTag()` live in `next/cache`; `LayoutProps<'/route'>` / `PageProps<'/route'>` are global types; `params` and `searchParams` are promises.

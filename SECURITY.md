# SECURITY — Phase 6 pass

A record of what was checked and why, not a general policy document.

- **Secrets**: `ANTHROPIC_API_KEY`, `RAPIDAPI_KEY`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET` all
  live in `.env.local` only, which `.gitignore`'s `.env*` line excludes from every commit
  (verified: `git status` never shows it as trackable). Every file that reads one of these is
  marked `import 'server-only'`, so importing it from a client component fails the build
  instead of silently bundling a secret into browser JS. Confirmed no key literal or model id
  appears anywhere outside `lib/config.ts` (`grep`'d across `src/`).
- **Idempotent trigger**: `POST /api/run` checks for a `runs` row with `status = 'running'`
  before creating a new one - a duplicate click while a run is in flight gets a 409, not a
  second run.
- **Rate limits (Layer 2)**: max 3 runs/24h counted from the `runs` table (survives across
  serverless invocations, unlike an in-memory counter). Max 12 matches/run enforced by
  `capShortlist`. Per-run cost guard checked before every LLM call in `run.ts`. Layer 1 (the
  Anthropic console spend cap) is the owner's responsibility outside this code - see README.
- **Zod validation**: every external API response (API-Football, football-data.org,
  the-odds-api) is parsed through a schema in `lib/data/schemas.ts` before it enters the
  engine. A shape change on the provider's side throws a clear error here instead of the
  engine computing garbage from `undefined`.
- **Prompt-injection defense**: the two LLM calls (`getQualitativeRead`, `getBreakThePick`)
  force structured tool output (`tool_choice: { type: 'tool', ... }`) and validate the result
  with Zod - the model cannot return free text that could redirect the pipeline. The system
  prompt explicitly instructs the model to treat all match/news data as data, never as
  instructions, and to ignore any instruction-like text found inside it.
- **SQL injection**: no raw SQL string-building anywhere in the app - every query goes through
  the Supabase JS client's parameterized query builder (`.select()`/`.insert()`/`.eq()`, etc.).
  The one place raw SQL was used at all was one-off schema migrations via the Supabase MCP
  tool during setup, not app runtime code.
- **XSS**: no `dangerouslySetInnerHTML` anywhere in the codebase - all rendering goes through
  React's default escaping.
- **RLS**: verified with the Supabase advisor tool after the initial migration. `runs`,
  `matches`, `picks`, `settlements` are scoped to `owner_id = auth.uid()` (directly or via a
  join back to `runs`). `api_cache`/`api_usage` have RLS enabled with zero policies - by
  design, so only the service-role client (used exclusively by server-only infra code) can
  touch them.
- **Single-owner enforcement**: `middleware`/`proxy.ts` (Next.js 16 renamed the convention
  mid-build - migrated, see the file's own comment) checks the signed-in user's email against
  `APEX_OWNER_EMAIL` on every request, redirecting anyone else to `/login` even if they
  somehow obtained a valid Supabase session. Public signup is disabled at the Supabase project
  level (see README) as the primary control; this is defense in depth on top of that.
- **`maxDuration`**: set explicitly on both server routes that call external services
  (`/api/run` at 300s, `/api/cron/settle` at 60s) so a stuck per-match job can't run
  indefinitely.
- **Graceful degradation**: a missing data field (no confirmed lineup, no live odds) resolves
  to a held or NO-PICK result in code, never a guessed value - see AUDIT.md items 1-4 and the
  VALUE GATE's `freshOdds: null` handling in `s7-gate.ts`.

## Known gap, documented rather than hidden

Run.ts's v1 only prices the Over/Under 2.5 goals market end-to-end (see the comment in
`run.ts`'s S4 section) - the full multi-axis market-fit selection across all nine spec markets,
and the lineup/form-history data pulls that would feed it, are the next real chunk of engine
work, not a security concern but worth stating plainly rather than implying broader coverage
than what's actually wired up.

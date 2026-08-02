# ARCHITECTURE — APEX

Next.js (App Router) + TypeScript on Vercel. Supabase for auth, Postgres, and RLS. Anthropic
API for the qualitative reasoning steps. One user, no multi-tenancy.

## Three layers, one direction of dependency

```
src/lib/data/      fetch + cache + normalize external data into typed JSON
src/lib/engine/     the APEX pipeline: signals, probability, gate, staking, settlement
src/app/            Next.js pages, API routes, the dashboard, auth
```

`engine` imports types from `data` but never imports a specific provider client — it receives
already-normalized, Zod-validated `NormalizedFixture` / `NormalizedOdds` objects. `data` never
imports from `engine`. `app` composes both but contains no business logic itself: routes call
`runPipeline()` and render whatever comes back. This is what keeps the pipeline testable and
swappable — you could replace API-Football with a different provider by writing one new
normalizer, and nothing in `engine` or `app` would need to change.

## Folders

```
src/
  app/
    (auth)/login/page.tsx           login screen, Supabase email-link auth
    run/page.tsx                    trigger + shortlist view
    results/[runId]/page.tsx        picks table for one run
    history/page.tsx                settlement dashboard (hit rate, ROI, CLV)
    api/
      run/route.ts                  POST: triggers a pipeline run (idempotent, rate-limited)
      settle/route.ts               POST: settlement job (also callable by cron)
      cron/settle/route.ts          Vercel Cron entry, calls the same settlement logic
    layout.tsx, globals.css
  lib/
    config.ts                       model IDs, base URLs, cost caps — the only place env
                                     values are read for these
    auth.ts                         owner-allowlist check, used by middleware
    data/
      schemas.ts                    Zod schemas for every external API shape
      normalize.ts                  external shape -> engine's internal types
      providers.ts                  per-provider capability map (what each free tier
                                     actually returns — see AUDIT.md items 1-4)
      api-football.ts               primary client (fixtures, stats, lineups, standings)
      football-data-org.ts          fallback client (fixtures/results/standings only)
      odds.ts                       the-odds-api client
      cache.ts                      Supabase-table-backed cache, tiered TTL
      rate-budget.ts                daily request counters, blocks calls over budget
    engine/
      types.ts                      internal typed shapes the pipeline operates on
      pipeline/
        s1-scan.ts                  code: fetch rolling-7-day fixture window
        s2-triage.ts                code: deterministic drop/keep/hold rules, cap 12
        motivation.ts               code: standings + games remaining -> motivation state
        signals.ts                  code: numeric signal scoring, spec weights
        poisson.ts                  code: goals/corners distribution from goals-rate proxy
        penalties.ts                code: lineup + capped volatility penalties
        s5-build.ts                 code: assembles BASE/SIGNALS/PENALTIES/RAW/FINAL/TIER
        s6-break.ts                 LLM: break-the-pick adversarial pass
        s7-gate.ts                  code: fresh-odds re-pull, VALUE GATE, confidence decomp
        tiering.ts                  code: stake sizing, bankroll rules
      llm.ts                        the one llm() seam - model id from config, Zod-validated
                                     structured output, prompt-cached rules block
      prompts.ts                    the static APEX rules block (cached) + per-call templates
      run.ts                        orchestrates S1-S7 for one triggered run
      settlement.ts                 code: W/L, ROI, CLV from settled fixtures
    supabase/
      client.ts                     browser client (anon key)
      server.ts                     server-component / route-handler client (cookies-based
                                     session; service-role client only in cron/settle route)
  components/                       Reveal-free, restrained dashboard UI (see design notes
                                     in Phase 5 commit)
```

## Data flow for one run

1. Owner clicks "Run" -> `POST /api/run`.
2. Route checks: in-flight run? 24h run-count under 3? If not, reject with a clear message.
3. `run.ts` calls S1 (fetch fixtures for the leagues + rolling window) then S2 (code-only
   triage) synchronously. Both are pure data + code, no model calls yet.
4. For the shortlist (<=12), S3 pulls per-match data (cache-first, respecting the daily
   API-Football budget), then S4 assigns motivation and picks 1-2 candidate markets per match.
5. Numeric signals, Poisson, and penalties run in code (S5's non-LLM parts).
6. The LLM is called twice per shortlisted match: once for the qualitative signal read, once
   for break-the-pick (S6). Both go through `llm()`, which reads the model id from
   `config.ts`, sends the cached rules block plus the per-match payload, and validates the
   response against a Zod schema before it re-enters the pipeline.
7. S7 re-pulls fresh odds, applies the VALUE GATE in code, builds the confidence decomposition,
   and tiering/staking runs in code.
8. Everything is persisted: `runs`, `matches` (every fixture considered, including drops, for
   traceability), `picks`, and later `settlements`.

## Config, not hardcoding

`lib/config.ts` is the single place that reads `ANTHROPIC_MODEL_DEFAULT` /
`ANTHROPIC_MODEL_ESCALATION`, API base URLs, the in-app cost caps (max runs/24h, max
matches/run, per-run cost guard), and provider request budgets. No other file reads these
values from `process.env` directly, and no model id or base URL is written as a literal
anywhere else in the codebase.

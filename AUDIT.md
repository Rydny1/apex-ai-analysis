# AUDIT — APEX v4.3.1 Lite spec vs. free-tier reality

Phase 0 pass over `APEX_v4.3_Lite.md` against the build brief's constraints (free-tier data
only, code-first, $2/month target). Each item has a proposed resolution. None are treated as
hard blockers — all have a reasonable, cost-safe default (usually: disable the affected market
rather than guess), so the build proceeds on the resolution stated.

## 1. Odds coverage does not match the spec's market table

**Issue:** The spec prices 1X2, DC, AH, O/U goals, TT, BTTS, CRN, CRD, 1HR. Free odds sources
(the-odds-api free "Starter" tier, ~500 credits/month) reliably carry only **h2h (1X2), totals
(O/U goals), and spreads (Asian handicap)** for soccer. BTTS, team totals, corners and cards
lines exist on some books but are inconsistently returned on the free tier and cost more
credits per call (more markets = more credits). API-Football's own odds endpoint is bundled
behind a paid plan tier in practice, not the free 100-req/day key.

**Resolution:** Treat odds availability as a runtime capability check per market, not an
assumption. `lib/data/odds.ts` requests `h2h,totals,spreads` from the-odds-api (3 markets fits
one credit-bounded call). If a match's response includes BTTS/corners/cards lines (some books
do carry them opportunistically), price them too. If not, apply the spec's own missing-data
fallback (S7): disable that market, fall back to DC or TT. This makes the VALUE GATE's
`P_imp` calculation always come from real quoted odds — never a synthesized one — at the cost
of CRN/CRD/BTTS/TT being rare in practice for v1. That's an accepted, honest limitation, not a
bug: the spec's own rule ("never price a market on data you do not have") already covers this.

## 2. CRD (cards) market needs referee tendency data the free tier doesn't have

**Issue:** API-Football's fixture payload names the referee but does not include a free,
structured referee-card-rate stat. Computing it ourselves (aggregating a referee's historical
matches) is possible in code from raw fixture data already being cached, but only becomes
reliable after enough fixtures accumulate in the cache — it's thin in month 1.

**Resolution:** Ship CRD disabled by default (config flag `MARKETS.CRD.enabled = false`). The
engine's per-referee card-rate aggregator still runs in the background (writes to the cache
every run), so the flag can flip on later once there's a real sample. This matches the spec's
missing-data fallback rule directly — never guess a referee's tendency from nothing.

## 3. football-data.org fallback doesn't cover the full league list

**Issue:** football-data.org's free tier covers roughly 12 competitions (top-five leagues,
Eredivisie, Primeira Liga, Championship, Champions League, a few others) at 10 req/min,
delayed, **no lineup/injury data on free tier**. The spec's league list also includes Scottish
Premiership, Belgian Pro League, UEL, and UECL, which football-data.org's free tier does not
carry at all.

**Resolution:** football-data.org is fixtures/results/standings-only fallback, used strictly
per-competition (only for the leagues it actually has). It is never used for lineups —
lineups/injuries come from API-Football only; if API-Football's daily cap is exhausted and a
lineup-sensitive market has no confirmed XI, the spec's own rule already covers it: hold that
market, price a lineup-agnostic one instead. No code change needed beyond respecting the
per-provider capability map in `lib/data/providers.ts`.

## 4. API-Football's 100 req/day cap vs. a 12-match shortlist with per-match data pulls

**Issue:** S3 pulls last-6-results (home+away = 2 calls), standings, injuries, and lineups per
match. Naively that's 4-5 calls × 12 matches = 48-60 calls, plus the S1 fixture scan across 12
leagues (12 calls) — around 60-72 calls for one run. At "max 3 runs/24h" that's up to ~216
calls, comfortably under 100/day only if runs are spread out, but a single heavy day (3 runs)
would blow the cap.

**Resolution:** Two changes, both code, both already implied by the brief's caching tiers:
- Cache standings and last-6-results with a 24h TTL (they don't change intra-day) — a second
  run the same day reuses them instead of re-fetching.
- Batch fixture scanning by league in one call per league (API-Football's `/fixtures` endpoint
  accepts a date range + league ID), not per-match.
This keeps one full cold run at roughly 24-30 calls (12 leagues scan + ~12-18 match-level
pulls after triage narrows the list), leaving headroom under 100/day even for a rare
same-day re-run. Documented as a hard constraint in `lib/data/rate-budget.ts` with a counter
that blocks new API-Football calls once the daily budget is spent and falls back to
football-data.org (fixtures/standings only) or cached data.

## 5. xG proxy noise is accepted, not a gap to fix

Per the brief, goals-for/against per game stands in for xG. No resolution needed — already
explicitly accepted in both source documents. Noted here only so it isn't rediscovered as a
"bug" later.

## 6. Batch API vs. synchronous LLM calls

**Issue:** The brief allows falling back to synchronous calls if batch adds too much
complexity, calling the discount "$0.40-0.80/month, an optimization not a requirement."

**Resolution:** Ship synchronous first (Anthropic Messages API, one call for the qualitative
read + one for break-the-pick, per shortlisted match, with prompt caching on the static rules
block). At 8-12 matches × 2 calls that is small enough to run within one Vercel function's
`maxDuration` without needing to poll a batch job. Batch mode is left as a documented future
optimization (`docs/future-optimizations.md`), not built in v1 — it would add polling/job-state
complexity disproportionate to $0.50/month at this volume, which is the same conclusion the
brief itself invites if "batch adds too much complexity."

## 7. Model IDs (verified live, per prime directive 6)

- Default (Sonnet class): `claude-sonnet-5`
- Optional escalation (Opus class): `claude-opus-5`
- Both are current production model IDs as of this build (August 2026). Stored only in
  `lib/config.ts`, never hardcoded elsewhere, per the brief.

## 8. Confirmed free-tier facts used for design decisions

- API-Football (RapidAPI): 100 requests/day, full endpoint catalog, daily window starts at
  subscription time.
- football-data.org: 10 req/min, ~12 competitions, delayed data, no lineups on free tier.
- the-odds-api: 500 credits/month (~16/day if spread evenly), h2h/totals/spreads reliable for
  soccer, other markets opportunistic.

None of these are blocking. All are handled by the resolutions above and reflected in the data
layer's per-provider capability map so the engine degrades gracefully instead of guessing.

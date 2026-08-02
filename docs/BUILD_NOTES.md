# Build notes

Real technical decisions made while building APEX, in the order they came up. Written for the
interview conversation, not for a changelog.

## Why Claude over Gemini

The build brief specifically wanted a model for two narrow jobs: reading team-news text for
qualitative signal, and arguing the counter-case against APEX's own pick before it ships (the
"break the pick" step). Both are judgment calls on unstructured text, not bulk generation, so the
cost profile mattered more than raw throughput. Claude Sonnet 5 with prompt caching means the
~2,000 tokens of static APEX rules and market-reading instructions are cached across every call
in a run, so a 10-match week pays that cost once, not ten times. That's the difference between a
run costing a few cents and a few dollars.

## Why deterministic code for triage and the math

An LLM is the wrong tool for anything that has one correct answer computable in closed form.
Poisson goals math, de-vigging market odds, and the VALUE GATE comparison (`P_apex - P_implied`)
are all pure functions - given the same inputs, they must return the same output, every time,
auditable in a unit test. Handing that to a model introduces variance where there should be
none, and makes a bad pick impossible to explain after the fact ("the model said so" is not a
debuggable answer). The model only touches the two steps above that genuinely require reading
comprehension and argument, nothing else.

## Why the free-tier data path

API-Football and football-data.org's free tiers cover fixtures, form, standings, and lineups
across the 10 leagues in scope, with daily/per-minute budgets that `lib/config.ts` tracks
explicitly (`dailyRequestBudget`, `requestsPerMinute`). Paying for a data provider would have
been the easy path, but the point of a personal project is proving the idea works inside a real
constraint - if APEX only works with an unlimited data budget, it doesn't prove much. The rate
budgeting code (`lib/data/rate-budget.ts`) exists because free tiers fail loudly if you don't
respect them.

## Why guest mode instead of guest runs

A real run costs roughly $0.25 in Anthropic spend. Once this became a portfolio link meant to be
shared, "anyone can click Run analysis" turned into "anyone can spend my money," with no ceiling
tied to how many people see the link. The fix wasn't a rate limit (still lets N people rack up
N * $0.25) - it was removing the ability entirely for everyone except one hardcoded admin
account, and replacing it with a real, pre-computed sample run so the product story ("here's
what it produces") survives without the liability. `/api/run` checks the caller's role
server-side and returns 403 for non-admins; the UI-level "Preview run (demo)" button is a
courtesy, not the actual gate.

## The v2 redesign pass

- **Dark canvas, one accent.** The first build used a light theme with a blue accent and read as
  generic SaaS. `#A8E6A3` (a faded pistachio, not a saturated green) was chosen because it reads
  as quiet confidence rather than a stock-app "positive number" green, and because wins/edge/CLV
  all being the same hue as the brand accent removes a whole extra semantic color from the
  system - there's no separate "success green" fighting the brand green for attention.
- **Elevation as a ladder, not a toggle.** `--bg-canvas` / `--bg-elevated` / `--bg-inset` are three
  genuinely different luminances, not "background" and "background but 4% lighter." The earlier
  build's flatness came from cards and page background being close enough in value that borders
  were doing all the work; the fix was making the values themselves different, borders second.
- **Guest and admin share one query, not two data models.** The tracking page and the homepage
  both read `global_track_record` with zero role branching - the "same numbers for everyone" is
  enforced by there being only one table to read, not by a permissions check that could drift out
  of sync between two code paths.
- **A real bug, found by building this pass.** Wiring the settlement cron into
  `global_track_record` surfaced that `computeRoiPct` had been called with a hardcoded stake of
  `1` instead of a percentage, producing `roi_pct` values like `0.35` that displayed as `0.4%`
  instead of the intended `35.0%`. Fixed to pass `100` (a full-stake percentage basis), with
  `stake_pct` on the pick doing the actual scaling down to real position size - `unitsPL =
  roi_pct * stake_pct / 100` everywhere now agrees with itself.
- **Demo data lives in its own tables.** `demo_run` / `demo_match` / `demo_pick` mirror the shape
  of the real `runs` / `matches` / `picks` tables so the same `PickRow` mapping code renders both
  - the alternative (branching every display component on "is this real or demo") would have
    doubled the surface area for a rendering bug.

## What's still a known gap

- CLV on real settlements is null until a closing-odds snapshot job exists - the settlement cron
  ships W/L and ROI first, which don't depend on a second, precisely-timed data pull.
- The ledger's column sort is client-side, fine at the current scale (tens of rows), would need a
  server-side sort once the real track record is large enough to paginate meaningfully.

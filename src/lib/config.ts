// Single source of truth for env-derived config. No other file reads these
// process.env keys directly, and no model id or base URL is hardcoded elsewhere.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    // Sonnet class is the default per the build brief. Opus class is an optional
    // escalation only, never the default call.
    modelDefault: process.env.ANTHROPIC_MODEL_DEFAULT ?? 'claude-sonnet-5',
    modelEscalation: process.env.ANTHROPIC_MODEL_ESCALATION ?? 'claude-opus-5',
  },
  apiFootball: {
    apiKey: process.env.API_FOOTBALL_KEY ?? '',
    // The direct api-sports.io gateway, authenticated with x-apisports-key -
    // not the RapidAPI marketplace listing of the same data, which uses a
    // different host and header pair. Confirmed live against /status: Free
    // plan, 100 requests/day, all endpoints.
    baseUrl: 'https://v3.football.api-sports.io',
    dailyRequestBudget: 90, // headroom under the 100/day cap
  },
  footballDataOrg: {
    apiKey: process.env.FOOTBALL_DATA_ORG_KEY ?? '',
    baseUrl: 'https://api.football-data.org/v4',
    // 10 req/min on the free tier.
    requestsPerMinute: 10,
  },
  oddsApi: {
    apiKey: process.env.ODDS_API_KEY ?? '',
    baseUrl: 'https://api.the-odds-api.com/v4',
    // 500 credits/month on the free tier (AUDIT.md item 1/8).
    monthlyCreditBudget: 480,
  },
  owner: {
    email: process.env.APEX_OWNER_EMAIL ?? '',
  },
  // The single account allowed to trigger real (costed) Anthropic runs. Every
  // other signed-in account is a guest and sees demo data - see
  // /api/auth/sync-profile and lib/auth-role.ts.
  admin: {
    email: process.env.ADMIN_EMAIL ?? '',
  },
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
  },
  // Layer 2 in-app cost/rate caps (Layer 1, the console spend cap, is set outside the code).
  limits: {
    maxRunsPerDay: 2,
    maxRunsPer5Days: 2,
    maxMatchesPerRun: 12,
    perRunCostGuardUsd: 1.5,
    // Must match /api/run's `maxDuration`. Used to decide when a 'running'
    // row is stale (its background execution died without ever reaching the
    // catch block - a hard platform kill, a hung fetch with no timeout) and
    // should stop blocking new runs, in both the actual enforcement and the
    // dashboard's own "run in progress" display.
    runMaxDurationSeconds: 300,
    staleRunGraceSeconds: 300,
  },
  // Leagues covered by the spec, used to build the S1 fixture scan.
  leagues: {
    // API-Football numeric league IDs, current as of this build.
    BUNDESLIGA: 78,
    LA_LIGA: 140,
    LIGUE_1: 61,
    SERIE_A: 135,
    EREDIVISIE: 88,
    LIGA_PORTUGAL: 94,
    SCOTTISH_PREMIERSHIP: 179,
    BELGIAN_PRO_LEAGUE: 144,
    CHAMPIONSHIP: 40,
    UCL: 2,
    UEL: 3,
    UECL: 848,
  },
} as const;

export function requiredServerConfig() {
  return {
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    apiFootballKey: required('API_FOOTBALL_KEY'),
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
  };
}

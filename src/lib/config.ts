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
  // API-Football's client was removed entirely - its free plan has no access
  // to any current season, on any endpoint (verified live), so it can never
  // return real data for this app regardless of key or code. football-data.org
  // is now the sole live data source.
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
  // Leagues covered, used to build the S1 fixture scan. football-data.org
  // competition codes - switched from API-Football numeric IDs because
  // API-Football's free plan has no access to any current season (verified
  // live: "Free plans do not have access to this season, try from 2022 to
  // 2024" on every endpoint), while football-data.org's free tier does cover
  // current fixtures/standings. Trade-off: 4 leagues football-data.org
  // doesn't offer on free tier (Scottish Premiership, Belgian Pro League,
  // Europa League, Conference League) are dropped rather than half-covered
  // through a second, mostly-dead provider.
  leagues: {
    BUNDESLIGA: 'BL1',
    LA_LIGA: 'PD',
    LIGUE_1: 'FL1',
    SERIE_A: 'SA',
    EREDIVISIE: 'DED',
    LIGA_PORTUGAL: 'PPL',
    CHAMPIONSHIP: 'ELC',
    UCL: 'CL',
  },
} as const;

export function requiredServerConfig() {
  return {
    anthropicApiKey: required('ANTHROPIC_API_KEY'),
    footballDataOrgKey: required('FOOTBALL_DATA_ORG_KEY'),
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
  };
}

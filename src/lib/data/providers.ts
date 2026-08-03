// The per-provider capability map referenced throughout AUDIT.md. This is the one
// place the pipeline checks "does this data source actually have what I'm asking
// for" - so a missing capability turns into a clean market-disable or provider
// fallback instead of the pipeline guessing at a value it doesn't have.
export const CAPABILITIES = {
  // API-Football's entry was removed - its free plan has no access to any
  // current season, on any endpoint (verified live), so it's not a usable
  // provider regardless of what this map claims about it.
  'football-data-org': {
    fixtures: true,
    standings: true,
    lineups: false, // AUDIT.md item 3 - no lineup/injury data on the free tier
    injuries: false,
    refereeCardRates: false,
    odds: false,
    // football-data.org's free tier only covers a subset of the spec's leagues.
    leagues: ['BUN', 'LAL', 'L1', 'SA', 'ERE', 'LPT', 'ELC', 'UCL', 'PL', 'BSA'] as const,
  },
  'odds-api': {
    markets: ['1X2', 'O/U', 'AH'] as const, // reliable free-tier markets - AUDIT.md item 1
    // BTTS/TT/CRN/CRD are opportunistic only: use them if a bookmaker happens to
    // return one, never assume they'll be there.
  },
} as const;

export function isMarketOddsReliable(market: string): boolean {
  return (CAPABILITIES['odds-api'].markets as readonly string[]).includes(market);
}

// Fallback data client: football-data.org. Free tier is fixtures/results/standings
// only - no lineups, no injuries (AUDIT.md item 3). Rate-limited at 10 requests
// per minute rather than a daily count, so this file just spaces calls out instead
// of tracking a budget in the database.
import 'server-only';
import { config } from '../config';
import { cached, CACHE_TTL_SECONDS } from './cache';
import { footballDataOrgMatchesResponseSchema, footballDataOrgStandingsResponseSchema } from './schemas';

let lastCallAt = 0;
const MIN_MS_BETWEEN_CALLS = Math.ceil(60_000 / config.footballDataOrg.requestsPerMinute);

async function callFootballDataOrg(path: string): Promise<unknown> {
  const waitMs = Math.max(0, MIN_MS_BETWEEN_CALLS - (Date.now() - lastCallAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastCallAt = Date.now();

  const response = await fetch(`${config.footballDataOrg.baseUrl}${path}`, {
    headers: { 'X-Auth-Token': config.footballDataOrg.apiKey },
  });

  if (!response.ok) {
    throw new Error(`football-data.org request failed: ${response.status} ${response.statusText} (${path})`);
  }

  return response.json();
}

export async function fetchMatches(competitionCode: string, dateFrom: string, dateTo: string) {
  const cacheKey = `football-data-org:matches:${competitionCode}:${dateFrom}:${dateTo}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.lineupsAndOdds, async () => {
    const raw = await callFootballDataOrg(`/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
    return footballDataOrgMatchesResponseSchema.parse(raw).matches;
  });
}

export async function fetchStandings(competitionCode: string) {
  const cacheKey = `football-data-org:standings:${competitionCode}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.standingsAndResults, async () => {
    const raw = await callFootballDataOrg(`/competitions/${competitionCode}/standings`);
    const parsed = footballDataOrgStandingsResponseSchema.parse(raw);
    return parsed.standings.find((s) => s.type === 'TOTAL')?.table ?? [];
  });
}

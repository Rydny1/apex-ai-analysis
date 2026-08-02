// Primary data client: API-Football, called directly against api-sports.io (not
// through the RapidAPI marketplace - those are two separate gateways with
// different auth headers for the same underlying data). Free tier is 100
// requests/day (confirmed against /status: x-ratelimit-requests-limit: 100) -
// every function here goes through the shared cache first and checks the daily
// budget before making a real call, so a run never silently blows past that.
import 'server-only';
import { z } from 'zod';
import { config } from '../config';
import { cached, CACHE_TTL_SECONDS } from './cache';
import { checkAndIncrementBudget } from './rate-budget';
import {
  apiFootballFixturesResponseSchema,
  apiFootballStandingsResponseSchema,
  apiFootballLineupsResponseSchema,
  apiFootballInjuriesResponseSchema,
  apiFootballTeamStatsSchema,
} from './schemas';

async function callApiFootball(path: string, params: Record<string, string>): Promise<unknown> {
  const canProceed = await checkAndIncrementBudget('api-football');
  if (!canProceed) {
    throw new Error('API-Football daily request budget is spent - fall back to football-data.org or cached data.');
  }

  const url = new URL(`${config.apiFootball.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: {
      'x-apisports-key': config.apiFootball.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`API-Football request failed: ${response.status} ${response.statusText} (${path})`);
  }

  return response.json();
}

// One call per league covers the whole rolling window - much cheaper than one
// call per match (see AUDIT.md item 4's fix for the request-budget math).
export async function fetchFixturesForLeague(leagueId: number, season: number, dateFrom: string, dateTo: string) {
  const cacheKey = `api-football:fixtures:${leagueId}:${dateFrom}:${dateTo}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.lineupsAndOdds, async () => {
    const raw = await callApiFootball('/fixtures', {
      league: String(leagueId),
      season: String(season),
      from: dateFrom,
      to: dateTo,
    });
    return apiFootballFixturesResponseSchema.parse(raw).response;
  });
}

export async function fetchTeamStats(teamId: number, leagueId: number, season: number) {
  const cacheKey = `api-football:team-stats:${teamId}:${leagueId}:${season}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.standingsAndResults, async () => {
    const raw = await callApiFootball('/teams/statistics', {
      team: String(teamId),
      league: String(leagueId),
      season: String(season),
    });
    // This endpoint returns a single object under `response`, not an array.
    const parsed = z.object({ response: apiFootballTeamStatsSchema }).parse(raw);
    return parsed.response;
  });
}

export async function fetchStandings(leagueId: number, season: number) {
  const cacheKey = `api-football:standings:${leagueId}:${season}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.standingsAndResults, async () => {
    const raw = await callApiFootball('/standings', { league: String(leagueId), season: String(season) });
    const parsed = apiFootballStandingsResponseSchema.parse(raw);
    return parsed.response[0]?.league.standings[0] ?? [];
  });
}

// Lineups and injuries are volatile - short TTL, always refetched close to
// kickoff, never served stale into a live pick (per the brief's caching rules).
export async function fetchLineups(fixtureId: number) {
  const cacheKey = `api-football:lineups:${fixtureId}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.lineupsAndOdds, async () => {
    const raw = await callApiFootball('/fixtures/lineups', { fixture: String(fixtureId) });
    return apiFootballLineupsResponseSchema.parse(raw).response;
  });
}

export async function fetchInjuries(fixtureId: number) {
  const cacheKey = `api-football:injuries:${fixtureId}`;
  return cached(cacheKey, CACHE_TTL_SECONDS.lineupsAndOdds, async () => {
    const raw = await callApiFootball('/injuries', { fixture: String(fixtureId) });
    return apiFootballInjuriesResponseSchema.parse(raw).response;
  });
}

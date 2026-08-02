// Turns each provider's raw (but Zod-validated) shape into the engine's internal
// types from lib/engine/types.ts. This is the ONLY place that knows what
// "API-Football's team stats object" or "football-data.org's standings row" looks
// like - everything downstream of this file only ever sees the clean internal
// shapes, which is what lets a provider be swapped out later without touching the
// engine at all.
import type {
  LineupInfo,
  NormalizedFixture,
  OddsQuote,
  StandingsSnapshot,
  TeamForm,
  TeamGoalsRate,
} from '../engine/types';
import type { z } from 'zod';
import type {
  apiFootballFixtureSchema,
  apiFootballStandingRowSchema,
  apiFootballLineupSchema,
  apiFootballInjurySchema,
  apiFootballTeamStatsSchema,
  oddsApiEventSchema,
} from './schemas';

// Maps API-Football's numeric league IDs to the BASE RATES table keys used in
// the spec (BUN/LAL/L1/SA/ERE/LPT/SPL, or a European code for continental ties).
const LEAGUE_ID_TO_BASE_RATE_KEY: Record<number, string> = {
  78: 'BUN',
  140: 'LAL',
  61: 'L1',
  135: 'SA',
  88: 'ERE',
  94: 'LPT',
  179: 'SPL',
  144: 'SPL', // Belgian Pro League has no dedicated base-rate row in the spec's table;
  // SPL is the closest published domestic base rate to fall back on rather than
  // inventing a number the spec never gave.
  40: 'SA', // Championship: same reasoning - no dedicated row, SA is the nearest published rate.
  2: 'UCL',
  3: 'UEL',
  848: 'UECL',
};

const EUROPEAN_LEAGUE_IDS = new Set([2, 3, 848]);

export function normalizeFixture(raw: z.infer<typeof apiFootballFixtureSchema>): NormalizedFixture {
  return {
    externalId: String(raw.fixture.id),
    leagueId: raw.league.id,
    competition: raw.league.name,
    baseRateKey: LEAGUE_ID_TO_BASE_RATE_KEY[raw.league.id] ?? 'SA',
    isEuropean: EUROPEAN_LEAGUE_IDS.has(raw.league.id),
    home: { name: raw.teams.home.name, externalId: String(raw.teams.home.id) },
    away: { name: raw.teams.away.name, externalId: String(raw.teams.away.id) },
    kickoff: raw.fixture.date,
  };
}

export function normalizeGoalsRate(raw: z.infer<typeof apiFootballTeamStatsSchema>, venue: 'home' | 'away'): TeamGoalsRate {
  const played = raw.fixtures.played[venue] || 1; // guard divide-by-zero for a team with no games yet
  return {
    goalsForPerGame: raw.goals.for.total[venue] / played,
    goalsAgainstPerGame: raw.goals.against.total[venue] / played,
    gamesPlayed: raw.fixtures.played[venue],
  };
}

// API-Football's stats endpoint doesn't return a simple W/D/L list - form has to
// be derived from recent fixture results, which is fetched separately. This helper
// takes that already-fetched list of recent results and buckets it into the
// last-3 / games-4-6 windows the spec's form scoring needs.
export function buildTeamForm(recentResultsMostRecentFirst: ('W' | 'D' | 'L')[]): TeamForm {
  return {
    last3: recentResultsMostRecentFirst.slice(0, 3),
    last4to6: recentResultsMostRecentFirst.slice(3, 6),
  };
}

export function normalizeStandingsRow(
  row: z.infer<typeof apiFootballStandingRowSchema>,
  totalTeams: number,
  totalGamesInSeason: number,
  relegationCutoffRank: number,
  europeanCutoffRank: number
): StandingsSnapshot {
  const gamesRemaining = Math.max(0, totalGamesInSeason - row.all.played);
  return {
    position: row.rank,
    points: row.points,
    gamesPlayed: row.all.played,
    gamesRemaining,
    totalTeams,
    pointsAboveRelegation:
      row.rank > relegationCutoffRank
        ? null // already inside the relegation zone - "how far above" doesn't apply
        : row.points - estimatePointsAtRank(relegationCutoffRank + 1, row.points, row.rank),
    pointsBelowEuropeanSpot:
      row.rank <= europeanCutoffRank
        ? null // already in a European spot
        : estimatePointsAtRank(europeanCutoffRank, row.points, row.rank) - row.points,
  };
}

// Without pulling the full standings table's every row, we approximate the gap
// using the team's own points and rank distance - a documented simplification.
// (Callers that already have the full table should compute the exact gap from the
// actual row at the cutoff rank instead of calling this.)
function estimatePointsAtRank(targetRank: number, knownPoints: number, knownRank: number): number {
  const rankDistance = Math.abs(targetRank - knownRank);
  const assumedPointsPerRank = 2; // a reasonable, documented average points-per-table-position gap
  return knownRank < targetRank ? knownPoints - rankDistance * assumedPointsPerRank : knownPoints + rankDistance * assumedPointsPerRank;
}

export function normalizeLineup(raw: z.infer<typeof apiFootballLineupSchema>, minutesToKickoff: number | null): LineupInfo {
  return {
    confirmed: raw.startXI.length > 0,
    minutesToKickoff,
    absences: [], // filled in separately from the injuries endpoint - see normalizeAbsences
    rotationsExpected: 0, // no free-tier signal for "expected rotations" beyond absences; left at 0 rather than guessed
  };
}

export function normalizeAbsences(
  injuries: z.infer<typeof apiFootballInjurySchema>[],
  topThreePlayerIds: Set<string>
): LineupInfo['absences'] {
  return injuries.map((injury) => ({
    name: injury.player.name,
    importance: topThreePlayerIds.has(String(injury.player.id)) ? 'top3' : 'squad',
  }));
}

export function normalizeOddsEvent(event: z.infer<typeof oddsApiEventSchema>): OddsQuote[] {
  const quotes: OddsQuote[] = [];
  for (const bookmaker of event.bookmakers) {
    for (const market of bookmaker.markets) {
      for (const outcome of market.outcomes) {
        quotes.push({
          market: market.key === 'h2h' ? '1X2' : market.key === 'totals' ? 'O/U' : 'AH',
          line: outcome.point !== undefined ? String(outcome.point) : undefined,
          side: outcome.name,
          decimalOdds: outcome.price,
          book: bookmaker.title,
          fetchedAt: bookmaker.last_update,
        });
      }
    }
  }
  return quotes;
}

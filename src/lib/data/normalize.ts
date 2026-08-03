// Turns football-data.org's raw (but Zod-validated) shapes into the engine's
// internal types from lib/engine/types.ts. This is the ONLY place that knows
// what a football-data.org standings row looks like - everything downstream
// only ever sees the clean internal shapes.
import type { LineupInfo, NormalizedFixture, OddsQuote, StandingsSnapshot, TeamForm, TeamGoalsRate } from '../engine/types';
import type { z } from 'zod';
import type { oddsApiEventSchema, footballDataOrgMatchSchema, footballDataOrgStandingRowSchema } from './schemas';

// Maps football-data.org's competition codes to the BASE RATES table keys used
// in the spec (BUN/LAL/L1/SA/ERE/LPT/SPL, or a European code for continental ties).
const LEAGUE_CODE_TO_BASE_RATE_KEY: Record<string, string> = {
  BL1: 'BUN',
  PD: 'LAL',
  FL1: 'L1',
  SA: 'SA',
  DED: 'ERE',
  PPL: 'LPT',
  ELC: 'SA', // Championship: no dedicated base-rate row in the spec's table - SA is the nearest published rate.
  CL: 'UCL',
  PL: 'LAL', // Premier League: no dedicated row either - LAL is the nearest published top-5-league rate.
  BSA: 'SA', // Brazil Serie A: same reasoning, nearest published rate rather than an invented number.
};

const EUROPEAN_LEAGUE_CODES = new Set(['CL']);

export function normalizeFdoFixture(raw: z.infer<typeof footballDataOrgMatchSchema>): NormalizedFixture {
  return {
    externalId: String(raw.id),
    leagueId: 0, // unused by football-data.org path - baseRateKey/isEuropean are derived from the competition code directly below
    competition: raw.competition.name,
    baseRateKey: LEAGUE_CODE_TO_BASE_RATE_KEY[raw.competition.code] ?? 'SA',
    isEuropean: EUROPEAN_LEAGUE_CODES.has(raw.competition.code),
    home: { name: raw.homeTeam.name, externalId: String(raw.homeTeam.id) },
    away: { name: raw.awayTeam.name, externalId: String(raw.awayTeam.id) },
    kickoff: raw.utcDate,
  };
}

// football-data.org's free tier has no separate team-statistics endpoint - goals
// rate is derived directly from the standings row's season totals instead.
export function normalizeFdoGoalsRate(row: z.infer<typeof footballDataOrgStandingRowSchema>): TeamGoalsRate {
  const played = row.playedGames || 1; // guard divide-by-zero for a team with no games yet
  return {
    goalsForPerGame: row.goalsFor / played,
    goalsAgainstPerGame: row.goalsAgainst / played,
    gamesPlayed: row.playedGames,
  };
}

export function normalizeFdoStandingsRow(
  row: z.infer<typeof footballDataOrgStandingRowSchema>,
  totalTeams: number,
  totalGamesInSeason: number,
  relegationCutoffRank: number,
  europeanCutoffRank: number
): StandingsSnapshot {
  const gamesRemaining = Math.max(0, totalGamesInSeason - row.playedGames);
  return {
    position: row.position,
    points: row.points,
    gamesPlayed: row.playedGames,
    gamesRemaining,
    totalTeams,
    pointsAboveRelegation:
      row.position > relegationCutoffRank ? null : row.points - estimatePointsAtRank(relegationCutoffRank + 1, row.points, row.position),
    pointsBelowEuropeanSpot:
      row.position <= europeanCutoffRank ? null : estimatePointsAtRank(europeanCutoffRank, row.points, row.position) - row.points,
  };
}

// Without pulling the full standings table's every row, we approximate the gap
// using the team's own points and rank distance - a documented simplification.
function estimatePointsAtRank(targetRank: number, knownPoints: number, knownRank: number): number {
  const rankDistance = Math.abs(targetRank - knownRank);
  const assumedPointsPerRank = 2; // a reasonable, documented average points-per-table-position gap
  return knownRank < targetRank ? knownPoints - rankDistance * assumedPointsPerRank : knownPoints + rankDistance * assumedPointsPerRank;
}

// No free-tier lineup/injury source exists at all now (API-Football's free plan
// has no current-season access; football-data.org's free tier never had this
// data). Every match runs with lineups unconfirmed - deriveMotivationState and
// the lineup penalty already treat that as a real, scored input, not a crash.
export function unconfirmedLineup(): LineupInfo {
  return { confirmed: false, minutesToKickoff: null, absences: [], rotationsExpected: 0 };
}

// API-Football's stats endpoint didn't return a simple W/D/L list - form had to
// be derived from recent fixture results, fetched separately. Kept as a stub:
// nothing currently fetches that history, so this always builds an empty form.
export function buildTeamForm(recentResultsMostRecentFirst: ('W' | 'D' | 'L')[]): TeamForm {
  return {
    last3: recentResultsMostRecentFirst.slice(0, 3),
    last4to6: recentResultsMostRecentFirst.slice(3, 6),
  };
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

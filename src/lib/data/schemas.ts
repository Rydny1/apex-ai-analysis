// Zod schemas for the external API shapes we actually use. Every network response
// gets parsed through one of these before it goes anywhere near the engine - if a
// provider changes its response shape, this throws a clear error here instead of
// the engine silently computing garbage from `undefined` fields.
//
// These schemas only describe the fields APEX reads, not every field the provider
// returns (`.passthrough()` lets the rest through unvalidated) - that keeps this
// file from becoming a brittle, full re-implementation of someone else's API docs.
import { z } from 'zod';

// --- API-Football (v3, RapidAPI) -----------------------------------------------

export const apiFootballFixtureSchema = z
  .object({
    fixture: z.object({
      id: z.number(),
      date: z.string(), // ISO timestamp
      status: z.object({ short: z.string() }),
      referee: z.string().nullable(),
    }),
    league: z.object({
      id: z.number(),
      name: z.string(),
      round: z.string(),
    }),
    teams: z.object({
      home: z.object({ id: z.number(), name: z.string() }),
      away: z.object({ id: z.number(), name: z.string() }),
    }),
  })
  .passthrough();

export const apiFootballFixturesResponseSchema = z
  .object({
    response: z.array(apiFootballFixtureSchema),
  })
  .passthrough();

export const apiFootballTeamStatsSchema = z
  .object({
    team: z.object({ id: z.number(), name: z.string() }),
    fixtures: z.object({
      played: z.object({ home: z.number(), away: z.number(), total: z.number() }),
    }),
    goals: z.object({
      for: z.object({ total: z.object({ home: z.number(), away: z.number(), total: z.number() }) }),
      against: z.object({ total: z.object({ home: z.number(), away: z.number(), total: z.number() }) }),
    }),
  })
  .passthrough();

export const apiFootballStandingRowSchema = z
  .object({
    rank: z.number(),
    points: z.number(),
    all: z.object({ played: z.number() }),
    team: z.object({ id: z.number(), name: z.string() }),
  })
  .passthrough();

export const apiFootballStandingsResponseSchema = z
  .object({
    response: z.array(
      z.object({
        league: z.object({
          standings: z.array(z.array(apiFootballStandingRowSchema)),
        }),
      })
    ),
  })
  .passthrough();

export const apiFootballLineupSchema = z
  .object({
    team: z.object({ id: z.number(), name: z.string() }),
    startXI: z.array(z.object({ player: z.object({ id: z.number(), name: z.string() }) })),
  })
  .passthrough();

export const apiFootballLineupsResponseSchema = z
  .object({
    response: z.array(apiFootballLineupSchema),
  })
  .passthrough();

export const apiFootballInjurySchema = z
  .object({
    player: z.object({ id: z.number(), name: z.string() }),
    team: z.object({ id: z.number(), name: z.string() }),
  })
  .passthrough();

export const apiFootballInjuriesResponseSchema = z
  .object({
    response: z.array(apiFootballInjurySchema),
  })
  .passthrough();

// --- football-data.org (v4, fallback: fixtures/results/standings only) --------

export const footballDataOrgMatchSchema = z
  .object({
    id: z.number(),
    utcDate: z.string(),
    status: z.string(),
    homeTeam: z.object({ id: z.number(), name: z.string() }),
    awayTeam: z.object({ id: z.number(), name: z.string() }),
    competition: z.object({ code: z.string(), name: z.string() }),
  })
  .passthrough();

export const footballDataOrgMatchesResponseSchema = z
  .object({
    matches: z.array(footballDataOrgMatchSchema),
  })
  .passthrough();

export const footballDataOrgStandingRowSchema = z
  .object({
    position: z.number(),
    points: z.number(),
    playedGames: z.number(),
    team: z.object({ id: z.number(), name: z.string() }),
  })
  .passthrough();

export const footballDataOrgStandingsResponseSchema = z
  .object({
    standings: z.array(
      z.object({
        type: z.string(), // "TOTAL" is the one we want, not HOME/AWAY splits
        table: z.array(footballDataOrgStandingRowSchema),
      })
    ),
  })
  .passthrough();

// --- the-odds-api (v4) ----------------------------------------------------------

export const oddsApiOutcomeSchema = z.object({
  name: z.string(), // team name, "Over"/"Under", etc.
  price: z.number(), // decimal odds
  point: z.number().optional(), // the line, for totals/spreads
});

export const oddsApiMarketSchema = z.object({
  key: z.enum(['h2h', 'totals', 'spreads']),
  outcomes: z.array(oddsApiOutcomeSchema),
});

export const oddsApiBookmakerSchema = z.object({
  key: z.string(),
  title: z.string(),
  last_update: z.string(),
  markets: z.array(oddsApiMarketSchema),
});

export const oddsApiEventSchema = z
  .object({
    id: z.string(),
    commence_time: z.string(),
    home_team: z.string(),
    away_team: z.string(),
    bookmakers: z.array(oddsApiBookmakerSchema),
  })
  .passthrough();

export const oddsApiResponseSchema = z.array(oddsApiEventSchema);

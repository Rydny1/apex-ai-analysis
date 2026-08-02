// Shared types for the APEX engine. Everything in lib/engine/* is built on these
// shapes. The data layer's job is to turn messy external API responses into these
// clean, typed objects - the engine never has to know or care which API a number
// came from.

// The nine motivation states from the spec's MOTIVATION MODEL table.
export type MotivationState =
  | 'MUST_WIN' // elimination or relegation is on the line this match
  | 'TITLE_PROMOTION_CHASE'
  | 'EUROPEAN_PUSH'
  | 'NOTHING_TO_LOSE' // safe, nothing left to play for
  | 'ROTATION_RISK' // already safe/through, likely to rest players
  | 'AGGREGATE_LEAD' // ahead in a two-legged tie
  | 'AGGREGATE_DEFICIT' // behind in a two-legged tie
  | 'DEAD_RUBBER' // literally nothing riding on the result
  | 'DERBY_REVENGE'
  | 'NEUTRAL'; // no special incentive either way

// The nine market codes the spec allows. Correct score / HT-FT / scorer / specials
// are explicitly "NEVER" in the spec's market table, so they don't exist as a type.
export type MarketCode = '1X2' | 'DC' | 'AH' | 'O/U' | 'TT' | 'BTTS' | 'CRN' | '1HR' | 'CRD';

export type Tier = 'T0' | 'T1' | 'T2' | 'LEAN' | 'NO-PICK';

// Win/Draw/Loss form, split into the two windows the spec scores separately.
export interface TeamForm {
  last3: ('W' | 'D' | 'L')[];
  last4to6: ('W' | 'D' | 'L')[];
}

// Goals-for/against per game. This stands in for xG, which isn't available on any
// free data source - see AUDIT.md item 5. Every place this feeds a probability, the
// UI and the code comments should call it "goals-rate proxy," never "xG."
export interface TeamGoalsRate {
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  gamesPlayed: number;
}

export interface StandingsSnapshot {
  position: number;
  points: number;
  gamesRemaining: number;
  gamesPlayed: number;
  totalTeams: number;
  // Distance in points from the relegation line and from a title/promotion/European
  // spot - the motivation model reads these, not raw position, since "8th" means
  // very different things in a 12-team vs a 20-team league.
  pointsAboveRelegation: number | null;
  pointsBelowEuropeanSpot: number | null;
}

// What we actually know about a team's starting XI at the moment of pricing.
export interface LineupInfo {
  confirmed: boolean;
  minutesToKickoff: number | null;
  absences: { name: string; importance: 'top3' | 'squad' }[];
  rotationsExpected: number;
}

// One quoted price for one market, from one book, at the moment it was fetched.
// `fetchedAt` matters: S7 requires a fresh re-pull right before the VALUE GATE runs,
// never the S3 snapshot, because odds drift.
export interface OddsQuote {
  market: MarketCode;
  line?: string; // e.g. "2.5" for an O/U line, "-1" for an Asian handicap
  side: string; // e.g. "home", "over", "draw_or_away"
  decimalOdds: number;
  book: string;
  fetchedAt: string; // ISO timestamp
}

export interface NormalizedFixture {
  externalId: string;
  leagueId: number; // API-Football's numeric league id - needed to pull team stats/standings for this fixture
  competition: string;
  // Key into the BASE RATES tables in the spec (BUN, LAL, L1, SA, ERE, LPT, SPL,
  // or the European GS/KO variants).
  baseRateKey: string;
  isEuropean: boolean;
  home: { name: string; externalId: string };
  away: { name: string; externalId: string };
  kickoff: string; // ISO
  // Present only for two-legged European ties.
  aggregate?: { leg: 1 | 2; homeGoalsAggregate: number; awayGoalsAggregate: number };
}

// Everything S3 gathers for one shortlisted match, before any scoring happens.
// A field being `undefined` means "this data source doesn't have it" - the engine
// must treat that as "skip this signal / disable this market," never as zero.
export interface MatchDataBundle {
  fixture: NormalizedFixture;
  home: {
    form: TeamForm;
    goalsRate: TeamGoalsRate;
    standings: StandingsSnapshot;
    lineup: LineupInfo;
  };
  away: {
    form: TeamForm;
    goalsRate: TeamGoalsRate;
    standings: StandingsSnapshot;
    lineup: LineupInfo;
  };
  h2h: { resultsFromHomePerspective: ('W' | 'D' | 'L')[] }; // most recent first
  corners?: { homeForPerGame: number; homeAgainstPerGame: number; awayForPerGame: number; awayAgainstPerGame: number };
  cardsRefereeAvgPerMatch?: number; // undefined until item 2 in AUDIT.md is resolved
  odds: OddsQuote[]; // the S3 snapshot; S7 re-fetches its own fresh copy
  volatilityFlags: {
    derby: boolean;
    relegationSixPointer: boolean;
    newManagerWithin3Matches: { home: boolean; away: boolean };
    bothManagersRotating: boolean;
    europeanKnockoutWithin4Days: { home: boolean; away: boolean };
    longTravelOver3500km: { home: boolean; away: boolean };
  };
}

// One named, directional, weighted contribution to a probability - always cited so
// a pick can be traced back to exactly why it was built. Signals are the spec's
// SIGNAL MODEL table entries (lineup, xG-proxy diff, motivation, form, ...).
export interface Signal {
  rank: number;
  name: string;
  direction: 'for' | 'against'; // "for" = supports the pick's side
  strength: 'weak' | 'moderate' | 'strong';
  pctPoints: number; // magnitude only, already capped at 10 per the spec
  evidence: string; // one plain-English sentence citing the actual numbers used
}

export interface PenaltyBreakdown {
  lineupPenaltyPct: number; // negative or zero
  volatilityPenaltiesRaw: { situation: string; pctPoints: number }[];
  volatilityPenaltyAppliedPct: number; // sum of the above, capped at -12
}

export interface ConfidenceDecomposition {
  model: number; // the probability build itself
  data: number; // were xG-proxy/lineups/odds clean and complete?
  lineup: number; // confirmed XI, or guessed?
}

export interface BreakThePickResult {
  tacticalCounter: string;
  squadRotationCounter: string;
  situationalPrecedentCounter: string;
  severity: 'WEAK' | 'MODERATE' | 'STRONG';
  penaltyPct: number; // 0 for WEAK, -5 for MODERATE, N/A (forces switch/NO-PICK) for STRONG
}

// The fully-built candidate for one match/market, before the VALUE GATE decides
// whether it's a placeable bet.
export interface PricedCandidate {
  fixture: NormalizedFixture;
  market: MarketCode;
  line?: string;
  baseRatePct: number | null; // null for markets with no base-rate table entry
  signals: Signal[];
  motivation: { home: MotivationState; away: MotivationState };
  penalties: PenaltyBreakdown;
  rawPct: number; // before the 89% ceiling
  finalPct: number; // after the ceiling
  breakThePick: BreakThePickResult;
}

// The output of the VALUE GATE (S7) - a candidate that has been checked against
// fresh odds. `edgePct` and `tier` are always present even for NO-PICKs, so a
// rejected candidate is fully explainable.
export interface GatedPick {
  candidate: PricedCandidate;
  freshOdds: OddsQuote | null; // null if no book still offers this market/line
  impliedPct: number | null;
  edgePct: number | null;
  tier: Tier;
  stakePct: number; // 0 for NO-PICK
  confidence: ConfidenceDecomposition;
  isPick: boolean;
  noPickReason: string | null;
}

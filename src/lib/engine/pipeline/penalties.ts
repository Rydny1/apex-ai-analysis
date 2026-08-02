// Deterministic penalty rules, straight from the spec's PENALTIES table. Two
// separate pools that never mix:
//   1. Lineup penalties - about who's actually on the pitch.
//   2. Volatility penalties - about how chaotic/unpredictable the match context is.
// The spec's key anti-empty-week change is that volatility penalties are CAPPED at
// -12% total, even if four different volatility flags are all true at once. That
// cap is the whole point of this file - get it wrong and the system either misses
// real edges (cap too low) or overrates chaotic matches (cap too high / missing).

import type { LineupInfo, PenaltyBreakdown } from '../types';

const VOLATILITY_TOTAL_CAP_PCT = -12;

export interface VolatilityFlags {
  derby: boolean;
  relegationSixPointer: boolean;
  newManagerWithin3Matches: boolean; // true if either team qualifies
  bothManagersRotating: boolean;
  europeanKnockoutWithin4Days: boolean; // true if either team qualifies
  longTravelOver3500km: boolean; // true if either team qualifies
}

// Lineup penalties are looked at separately from volatility, and can also produce
// a "hold this market" instruction rather than a plain percentage - the spec is
// explicit that an unconfirmed XI on a lineup-sensitive market should be held, not
// guessed at.
export function computeLineupPenalty(
  lineup: LineupInfo,
  marketIsLineupSensitive: boolean
): { penaltyPct: number; hold: boolean; reason: string } {
  // No team news within the last hour before kickoff, on a market that actually
  // depends on the lineup: don't price it at all yet.
  if (
    marketIsLineupSensitive &&
    !lineup.confirmed &&
    lineup.minutesToKickoff !== null &&
    lineup.minutesToKickoff <= 60
  ) {
    return { penaltyPct: 0, hold: true, reason: 'No confirmed XI within 60 minutes of kickoff on a lineup-sensitive market.' };
  }

  const top3Absent = lineup.absences.some((a) => a.importance === 'top3');
  if (top3Absent) {
    return { penaltyPct: -12, hold: false, reason: 'A top-3 player (GK / main striker / playmaker) is confirmed absent.' };
  }

  if (lineup.rotationsExpected >= 4) {
    return { penaltyPct: -12, hold: false, reason: '4+ rotations confirmed - consider steering to a lineup-agnostic market instead.' };
  }

  const nonCriticalAbsence = lineup.absences.some((a) => a.importance === 'squad');
  if (nonCriticalAbsence) {
    return { penaltyPct: -6, hold: false, reason: 'A confirmed absence, non-critical to the outcome.' };
  }

  if (!lineup.confirmed) {
    return { penaltyPct: -3, hold: false, reason: 'Using the expected XI - likely correct but not yet confirmed.' };
  }

  return { penaltyPct: 0, hold: false, reason: 'Confirmed XI, no absences of note.' };
}

// Volatility penalties: add up every situation that applies, then clamp the total
// at the -12% cap. This is what stops three or four independent volatility flags
// from stacking past -18% and forcing a false NO-PICK on a match with a real edge.
export function computeVolatilityPenalty(
  flags: VolatilityFlags
): Pick<PenaltyBreakdown, 'volatilityPenaltiesRaw' | 'volatilityPenaltyAppliedPct'> {
  const raw: { situation: string; pctPoints: number }[] = [];

  if (flags.derby) raw.push({ situation: 'Derby / local rivalry', pctPoints: -5 });
  if (flags.relegationSixPointer) raw.push({ situation: 'Relegation six-pointer', pctPoints: -4 });
  if (flags.newManagerWithin3Matches) raw.push({ situation: 'New manager within 3 matches', pctPoints: -5 });
  if (flags.bothManagersRotating) raw.push({ situation: 'Both managers confirmed rotating', pctPoints: -6 });
  if (flags.europeanKnockoutWithin4Days) raw.push({ situation: 'European knockout within 4 days', pctPoints: -5 });
  if (flags.longTravelOver3500km) raw.push({ situation: 'Long travel between fixtures (>3,500 km)', pctPoints: -3 });

  const uncappedTotal = raw.reduce((sum, r) => sum + r.pctPoints, 0);
  // Both numbers are negative, so "cap" means "don't let the total get MORE
  // negative than -12" - i.e. take whichever is closer to zero.
  const appliedTotal = Math.max(uncappedTotal, VOLATILITY_TOTAL_CAP_PCT);

  return { volatilityPenaltiesRaw: raw, volatilityPenaltyAppliedPct: appliedTotal };
}

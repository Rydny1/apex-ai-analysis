// Derives a team's motivation state purely from standings + games remaining - no
// LLM, no guessing. The spec names nine states but doesn't give exact numeric
// thresholds for "close to the drop" or "in the title race," so the thresholds
// below are this build's documented, reasonable default (see AUDIT.md-style
// reasoning: each remaining game is worth at most 3 points, so a gap that's still
// coverable in the games left is a genuine threat, not a rounding error).

import type { MotivationState, StandingsSnapshot } from '../types';

const POINTS_PER_WIN = 3;

export interface MotivationInput {
  standings: StandingsSnapshot;
  isEuropeanTie?: { aggregateLead: number }; // only set for two-legged European ties
  isDeadRubber?: boolean; // both sides already know the outcome doesn't matter
}

export function deriveMotivationState(input: MotivationInput): MotivationState {
  const { standings } = input;

  if (input.isDeadRubber) return 'DEAD_RUBBER';

  if (input.isEuropeanTie) {
    return input.isEuropeanTie.aggregateLead > 0 ? 'AGGREGATE_LEAD' : 'AGGREGATE_DEFICIT';
  }

  const maxPointsStillAvailable = standings.gamesRemaining * POINTS_PER_WIN;

  // Relegation danger: the cushion above the drop line is still closeable with the
  // games left. A team 15 points clear with 5 games left (max 15 available) is
  // borderline; comfortably above that, it's safe.
  if (
    standings.pointsAboveRelegation !== null &&
    standings.pointsAboveRelegation <= maxPointsStillAvailable
  ) {
    return 'MUST_WIN';
  }

  // Title / promotion / European chase: same logic, applied to the gap below the
  // relevant spot instead of above the drop line.
  if (
    standings.pointsBelowEuropeanSpot !== null &&
    standings.pointsBelowEuropeanSpot <= maxPointsStillAvailable
  ) {
    // Top-of-table chases (position 1-3ish) read as title/promotion; anything
    // further down that's still mathematically live reads as a European push.
    return standings.position <= 3 ? 'TITLE_PROMOTION_CHASE' : 'EUROPEAN_PUSH';
  }

  // Comfortably mid-table: safe from the drop, out of reach of Europe. Nothing
  // riding on the result either way.
  const comfortablySafe =
    standings.pointsAboveRelegation === null || standings.pointsAboveRelegation > maxPointsStillAvailable;
  const outOfEuropeanReach =
    standings.pointsBelowEuropeanSpot === null || standings.pointsBelowEuropeanSpot > maxPointsStillAvailable;

  if (comfortablySafe && outOfEuropeanReach && standings.gamesRemaining > 0) {
    return 'NOTHING_TO_LOSE';
  }

  return 'NEUTRAL';
}

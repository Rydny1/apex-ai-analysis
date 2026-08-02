// S2 - TRIAGE. Deterministic code, no LLM - running a model over 50+ fixtures is
// exactly where cost and timeout risk live, and none of it needs judgment yet.
// Every dropped match gets a one-line reason logged, so the slate output can show
// the full NO-PICK log the spec asks for.

export type TriageStage = 'dropped' | 'held' | 'entered';

export interface TriageInput {
  hasOdds: boolean;
  alreadyKickedOff: boolean;
  bothTeamsDeadRubber: boolean;
  goalsRateDifferential: number; // absolute gap between the two sides' net goals rate
  hasIncentiveAngle: boolean; // either side has a live motivation state (MUST_WIN, chase, etc.)
  managerSackedWithin48h: boolean;
  managerReplacementClarity: boolean;
  lineupSensitiveMarketUnconfirmed: boolean;
}

export interface TriageResult {
  stage: TriageStage;
  reason: string;
}

const GOALS_RATE_DIFFERENTIAL_THRESHOLD = 0.3; // documented default: below this, treated as "no real signal"

export function triageMatch(input: TriageInput): TriageResult {
  if (input.alreadyKickedOff) return { stage: 'dropped', reason: 'Already kicked off.' };
  if (!input.hasOdds) return { stage: 'dropped', reason: 'No odds available - cannot pass the VALUE GATE regardless of probability.' };
  if (input.bothTeamsDeadRubber) return { stage: 'dropped', reason: 'Dead rubber for both sides.' };
  if (input.managerSackedWithin48h && !input.managerReplacementClarity) {
    return { stage: 'dropped', reason: 'Manager sacked within 48h with no replacement clarity yet.' };
  }
  if (input.goalsRateDifferential < GOALS_RATE_DIFFERENTIAL_THRESHOLD && !input.hasIncentiveAngle) {
    return { stage: 'dropped', reason: 'Goals-rate differential below threshold with no incentive angle.' };
  }
  if (input.lineupSensitiveMarketUnconfirmed) {
    return { stage: 'held', reason: 'Lineup unconfirmed on a lineup-sensitive market - re-check near kickoff.' };
  }
  return { stage: 'entered', reason: 'Surface signal found: differential, incentive, form, lineup, or style-mismatch candidate.' };
}

// Enforces the hard cap of 12 matches per run (Layer 2 cost guard). Keeps the
// highest-signal matches (largest goals-rate differential as a simple proxy for
// "how much is actually going on here") and logs the rest as not analyzed.
export function capShortlist<T extends { goalsRateDifferential: number }>(
  entered: T[],
  maxMatches: number
): { kept: T[]; overflow: T[] } {
  const sorted = [...entered].sort((a, b) => b.goalsRateDifferential - a.goalsRateDifferential);
  return { kept: sorted.slice(0, maxMatches), overflow: sorted.slice(maxMatches) };
}

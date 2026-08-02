// S5 - BUILD. Assembles BASE RATE + SIGNALS + PENALTIES into RAW and then FINAL
// (after the 89% hard ceiling), exactly per the spec's per-market printout shape.
// Pure code - S6 (break-the-pick, the one place this candidate's probability can
// still move) runs afterward in run.ts and is applied via `applyBreakThePickPenalty`
// below, since the spec orders BUILD before BREAK THE PICK.
import type { PenaltyBreakdown, Signal } from '../types';

const HARD_CEILING_PCT = 89;

export interface BuildCandidateInput {
  baseRatePct: number | null; // null for markets with no base-rate table entry (e.g. AH, CRN without a table row)
  signals: Signal[]; // each already capped at +/-10 by the caller, per the spec's per-signal cap
  penalties: PenaltyBreakdown;
}

export interface BuildCandidateOutput {
  rawPct: number;
  cappedPct: number; // after the 89% hard ceiling - NOT yet after S6's break-the-pick penalty
}

export function buildCandidateProbability(input: BuildCandidateInput): BuildCandidateOutput {
  // Start from the base rate when the market has one; otherwise start from a
  // neutral 50% and let the signals do all the work (documented default for
  // markets like AH or CRN that the spec's base-rate table doesn't cover).
  const startingPct = input.baseRatePct ?? 50;

  const signalTotal = input.signals.reduce((sum, s) => sum + (s.direction === 'for' ? s.pctPoints : -s.pctPoints), 0);

  const rawPct = startingPct + signalTotal + input.penalties.lineupPenaltyPct + input.penalties.volatilityPenaltyAppliedPct;

  return {
    rawPct,
    cappedPct: Math.min(rawPct, HARD_CEILING_PCT),
  };
}

// Applied after S6. MODERATE severity costs -5%; STRONG doesn't get a percentage
// at all - it forces a switch/NO-PICK upstream (see s6-break.ts), so this function
// is only ever called for WEAK/MODERATE results.
export function applyBreakThePickPenalty(cappedPct: number, breakThePickPenaltyPct: number): number {
  return Math.min(cappedPct + breakThePickPenaltyPct, HARD_CEILING_PCT);
}

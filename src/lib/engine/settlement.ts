// S12 - SETTLEMENT. Pure code, no LLM: given a pick's entry odds and the actual
// result (and later, the closing odds), compute W/L, ROI, and CLV. CLV (closing
// line value) is the metric the spec calls "the only real definition of edge" -
// a clean win record over a handful of bets means nothing on its own.
export type SettlementResult = 'win' | 'loss' | 'push' | 'void';

export function computeRoiPct(result: SettlementResult, entryOdds: number, stakePct: number): number {
  if (result === 'push' || result === 'void') return 0;
  if (result === 'loss') return -stakePct;
  return stakePct * (entryOdds - 1); // win: profit is stake * (odds - 1)
}

// CLV = closing implied probability minus entry implied probability. Positive CLV
// means the price got worse for a new bettor after we bet - i.e. we beat the
// closing line, which is the spec's definition of proven edge.
export function computeClvPct(entryOdds: number, closingOdds: number): number {
  const entryImplied = (1 / entryOdds) * 100;
  const closingImplied = (1 / closingOdds) * 100;
  return closingImplied - entryImplied;
}

export interface HitRateSummary {
  wins: number;
  losses: number;
  pushes: number;
  totalDecided: number;
  hitRatePct: number;
  positiveClvCount: number;
  positiveClvRatePct: number;
}

export function summarizeSettlements(
  settlements: { result: SettlementResult; clvPct: number | null }[]
): HitRateSummary {
  const decided = settlements.filter((s) => s.result === 'win' || s.result === 'loss');
  const wins = decided.filter((s) => s.result === 'win').length;
  const losses = decided.filter((s) => s.result === 'loss').length;
  const pushes = settlements.filter((s) => s.result === 'push' || s.result === 'void').length;
  const withClv = settlements.filter((s) => s.clvPct !== null);
  const positiveClvCount = withClv.filter((s) => (s.clvPct as number) > 0).length;

  return {
    wins,
    losses,
    pushes,
    totalDecided: decided.length,
    hitRatePct: decided.length > 0 ? (wins / decided.length) * 100 : 0,
    positiveClvCount,
    positiveClvRatePct: withClv.length > 0 ? (positiveClvCount / withClv.length) * 100 : 0,
  };
}

// Spec's calibration triggers: every 20 picks, check hit rate deviation and CLV
// health. Returns a plain-English flag rather than silently adjusting anything -
// weight tuning is explicitly out of scope for this build (see the build brief's
// "What NOT to build").
export function checkCalibrationFlags(summary: HitRateSummary, tierTargetHitRatePct: number): string[] {
  const flags: string[] = [];
  if (summary.totalDecided < 20) return flags; // spec's checks only apply at 20+ picks

  if (Math.abs(summary.hitRatePct - tierTargetHitRatePct) > 10) {
    flags.push(`Hit rate ${summary.hitRatePct.toFixed(1)}% deviates more than 10 points from the ${tierTargetHitRatePct}% tier target - review signal weights.`);
  }
  if (summary.positiveClvRatePct < 55) {
    flags.push(`Positive CLV rate ${summary.positiveClvRatePct.toFixed(1)}% is below the 55% target over 20+ picks.`);
  }
  if (100 - summary.positiveClvRatePct > 45) {
    flags.push('Negative CLV on more than 45% of picks - stop and review the whole process per the spec.');
  }
  return flags;
}

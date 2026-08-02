// S6 - BREAK THE PICK. The one adversarial LLM step: state a tactical, a squad,
// and a situational counter-case, then score how badly they'd hurt the thesis.
// The severity-to-penalty mapping itself is deterministic code (spec: WEAK =
// proceed, MODERATE = proceed at -5%, STRONG = switch market or NO-PICK) - only
// the counter-cases themselves need model judgment.
import type { BreakThePickResult } from '../types';
import { estimateCostUsd, getBreakThePick } from '../llm';

export async function runBreakThePick(matchSummary: string, pickSummary: string): Promise<{ result: BreakThePickResult; costUsd: number }> {
  const { data, cost } = await getBreakThePick(matchSummary, pickSummary);

  const penaltyPct = data.severity === 'MODERATE' ? -5 : 0; // STRONG doesn't get a penalty pct - it forces a switch/NO-PICK instead

  return {
    result: {
      tacticalCounter: data.tacticalCounter,
      squadRotationCounter: data.squadRotationCounter,
      situationalPrecedentCounter: data.situationalPrecedentCounter,
      severity: data.severity,
      penaltyPct,
    },
    costUsd: estimateCostUsd(cost),
  };
}

// STRONG means "switch market or NO-PICK" per the spec - this pipeline doesn't
// have a second candidate market queued up to switch to at this stage, so STRONG
// always resolves to NO-PICK rather than silently keeping the original pick.
export function breakThePickForcesNoPick(result: BreakThePickResult): boolean {
  return result.severity === 'STRONG';
}

// Pure math. No LLM, no external calls. This is the Poisson model the spec asks
// for goals and corners markets, built from the goals-rate proxy (see AUDIT.md
// item 5 - this stands in for xG, which isn't free anywhere).
//
// The core idea: if a team scores `lambda` goals on average, the number of goals
// they score in any one match follows a Poisson distribution with that mean. Two
// independent Poisson variables added together are still Poisson (with the two
// means added), which is what lets us model "total goals in the match" cleanly.

// P(exactly k events) for a Poisson distribution with mean `lambda`.
function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // Standard Poisson formula: (lambda^k * e^-lambda) / k!
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial;
}

// P(k or fewer events).
function poissonCdf(lambda: number, k: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPmf(lambda, i);
  return sum;
}

// Expected goals for each side, blended from "this team's own scoring rate" and
// "the opponent's own conceding rate" - a simple average of the two proxies, since
// we don't have a league-wide baseline to properly weight attack vs. defense
// strength (that would need full xG data we don't have).
export function expectedGoals(
  attackFor: number,
  opponentAgainst: number
): number {
  return (attackFor + opponentAgainst) / 2;
}

// P(total goals in the match > line), for lines like 1.5 / 2.5 / 3.5.
// Total goals = home goals + away goals, and the sum of two independent Poisson
// variables is itself Poisson with the combined mean - that's the whole trick.
export function probabilityOverTotalGoals(lambdaHome: number, lambdaAway: number, line: number): number {
  const combinedLambda = lambdaHome + lambdaAway;
  const wholeGoalsAtOrBelowLine = Math.floor(line); // e.g. line=2.5 -> 2 goals or fewer is "under"
  return 1 - poissonCdf(combinedLambda, wholeGoalsAtOrBelowLine);
}

// P(both teams score at least one goal), treating home/away goals as independent.
export function probabilityBothTeamsScore(lambdaHome: number, lambdaAway: number): number {
  const pHomeScores = 1 - poissonPmf(lambdaHome, 0);
  const pAwayScores = 1 - poissonPmf(lambdaAway, 0);
  return pHomeScores * pAwayScores;
}

// P(one specific team's own goals > line) - used for Team Total markets.
export function probabilityTeamOver(lambdaTeam: number, line: number): number {
  const wholeGoalsAtOrBelowLine = Math.floor(line);
  return 1 - poissonCdf(lambdaTeam, wholeGoalsAtOrBelowLine);
}

// Corners use the exact same Poisson machinery, just fed corner rates instead of
// goal rates.
export const expectedCorners = expectedGoals;
export const probabilityOverTotalCorners = probabilityOverTotalGoals;

// The spec's reconciliation rule (S5): compare the signal-based heuristic estimate
// against the Poisson estimate for the same probability. If they're far apart,
// trust the Poisson number less (or split the difference) rather than silently
// picking whichever is more convenient.
export function reconcileWithPoisson(heuristicPct: number, poissonPct: number): number {
  const gap = Math.abs(heuristicPct - poissonPct);
  if (gap > 15) return Math.min(heuristicPct, poissonPct); // big disagreement: take the more conservative number
  if (gap >= 8) return (heuristicPct + poissonPct) / 2; // moderate disagreement: average them
  return heuristicPct; // close enough: proceed with the heuristic as-is
}

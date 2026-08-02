// Unit tests for the Poisson math. These numbers matter for real money, so they're
// checked against hand-calculable values, not just "does it run."
import { describe, expect, it } from 'vitest';
import {
  expectedGoals,
  probabilityBothTeamsScore,
  probabilityOverTotalGoals,
  probabilityTeamOver,
  reconcileWithPoisson,
} from '../poisson';

describe('expectedGoals', () => {
  it('averages a team\'s own scoring rate with the opponent\'s conceding rate', () => {
    expect(expectedGoals(2.0, 1.0)).toBe(1.5);
    expect(expectedGoals(0, 0)).toBe(0);
  });
});

describe('probabilityOverTotalGoals', () => {
  it('gives 0% for an over line when both teams never score', () => {
    expect(probabilityOverTotalGoals(0, 0, 1.5)).toBe(0);
  });

  it('matches a hand-calculated value for lambda=1.5, line=1.5', () => {
    // Combined lambda = 3.0. P(over 1.5) = 1 - P(0) - P(1).
    // P(0) = e^-3 = 0.049787..., P(1) = 3 * e^-3 = 0.149361...
    const result = probabilityOverTotalGoals(1.5, 1.5, 1.5);
    expect(result).toBeCloseTo(1 - 0.0497871 - 0.1493612, 4);
  });

  it('increases monotonically as combined lambda increases', () => {
    const low = probabilityOverTotalGoals(0.5, 0.5, 2.5);
    const high = probabilityOverTotalGoals(2, 2, 2.5);
    expect(high).toBeGreaterThan(low);
  });

  it('stays within [0, 1] for extreme inputs', () => {
    const result = probabilityOverTotalGoals(10, 10, 2.5);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('probabilityBothTeamsScore', () => {
  it('is 0 if either side has zero expected goals', () => {
    expect(probabilityBothTeamsScore(0, 1.5)).toBe(0);
    expect(probabilityBothTeamsScore(1.5, 0)).toBe(0);
  });

  it('matches the product of each side\'s "scores at least once" probability', () => {
    const lambdaHome = 1.2;
    const lambdaAway = 0.9;
    const expected = (1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway));
    expect(probabilityBothTeamsScore(lambdaHome, lambdaAway)).toBeCloseTo(expected, 8);
  });
});

describe('probabilityTeamOver', () => {
  it('matches probabilityOverTotalGoals when treated as a single-team total', () => {
    // A team total over 1.5 with lambda=2 should equal 1 - P(0) - P(1) for that lambda.
    const result = probabilityTeamOver(2, 1.5);
    const pmf0 = Math.exp(-2);
    const pmf1 = 2 * Math.exp(-2);
    expect(result).toBeCloseTo(1 - pmf0 - pmf1, 8);
  });
});

describe('reconcileWithPoisson', () => {
  it('uses the heuristic as-is when the gap is under 8 points', () => {
    expect(reconcileWithPoisson(70, 65)).toBe(70);
  });

  it('averages when the gap is 8-15 points', () => {
    expect(reconcileWithPoisson(70, 60)).toBe(65);
  });

  it('takes the lower (more conservative) number when the gap exceeds 15 points', () => {
    expect(reconcileWithPoisson(80, 60)).toBe(60);
    expect(reconcileWithPoisson(60, 80)).toBe(60);
  });
});

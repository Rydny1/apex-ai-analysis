// Unit tests for the penalty rules - especially the -12% volatility cap, which is
// the spec's core anti-empty-week fix. Getting the cap wrong either lets penalties
// stack past it (false NO-PICKs on matches with real edge) or fails to apply it at
// all (overstating how risky a chaotic match really is).
import { describe, expect, it } from 'vitest';
import { computeLineupPenalty, computeVolatilityPenalty, type VolatilityFlags } from '../penalties';
import type { LineupInfo } from '../../types';

const noFlags: VolatilityFlags = {
  derby: false,
  relegationSixPointer: false,
  newManagerWithin3Matches: false,
  bothManagersRotating: false,
  europeanKnockoutWithin4Days: false,
  longTravelOver3500km: false,
};

describe('computeVolatilityPenalty', () => {
  it('applies nothing when no flags are set', () => {
    const result = computeVolatilityPenalty(noFlags);
    expect(result.volatilityPenaltyAppliedPct).toBe(0);
    expect(result.volatilityPenaltiesRaw).toHaveLength(0);
  });

  it('sums individual penalties when the uncapped total is within -12', () => {
    // Derby (-5) + relegation six-pointer (-4) = -9, still within the cap.
    const result = computeVolatilityPenalty({ ...noFlags, derby: true, relegationSixPointer: true });
    expect(result.volatilityPenaltyAppliedPct).toBe(-9);
  });

  it('caps the total at -12 even when every flag is true (-28 uncapped)', () => {
    const allFlags: VolatilityFlags = {
      derby: true,
      relegationSixPointer: true,
      newManagerWithin3Matches: true,
      bothManagersRotating: true,
      europeanKnockoutWithin4Days: true,
      longTravelOver3500km: true,
    };
    const result = computeVolatilityPenalty(allFlags);
    // -5 + -4 + -5 + -6 + -5 + -3 = -28 uncapped
    const uncapped = result.volatilityPenaltiesRaw.reduce((s, r) => s + r.pctPoints, 0);
    expect(uncapped).toBe(-28);
    expect(result.volatilityPenaltyAppliedPct).toBe(-12);
  });

  it('caps at exactly -12 for a combination that lands right at the boundary', () => {
    // Both managers rotating (-6) + European KO within 4 days (-5) + long travel (-3) = -14 uncapped
    const result = computeVolatilityPenalty({
      ...noFlags,
      bothManagersRotating: true,
      europeanKnockoutWithin4Days: true,
      longTravelOver3500km: true,
    });
    expect(result.volatilityPenaltyAppliedPct).toBe(-12);
  });
});

describe('computeLineupPenalty', () => {
  const baseLineup: LineupInfo = {
    confirmed: true,
    minutesToKickoff: 30,
    absences: [],
    rotationsExpected: 0,
  };

  it('applies no penalty for a confirmed XI with no absences', () => {
    const result = computeLineupPenalty(baseLineup, true);
    expect(result.penaltyPct).toBe(0);
    expect(result.hold).toBe(false);
  });

  it('holds a lineup-sensitive market when no XI is confirmed within 60 minutes of kickoff', () => {
    const result = computeLineupPenalty({ ...baseLineup, confirmed: false, minutesToKickoff: 45 }, true);
    expect(result.hold).toBe(true);
  });

  it('does not hold a lineup-agnostic market even with no confirmed XI', () => {
    const result = computeLineupPenalty({ ...baseLineup, confirmed: false, minutesToKickoff: 45 }, false);
    expect(result.hold).toBe(false);
  });

  it('applies -12 when a top-3 player is confirmed absent', () => {
    const result = computeLineupPenalty(
      { ...baseLineup, absences: [{ name: 'Star striker', importance: 'top3' }] },
      true
    );
    expect(result.penaltyPct).toBe(-12);
  });

  it('applies -12 for 4+ confirmed rotations', () => {
    const result = computeLineupPenalty({ ...baseLineup, rotationsExpected: 4 }, true);
    expect(result.penaltyPct).toBe(-12);
  });

  it('applies -6 for a confirmed non-critical absence', () => {
    const result = computeLineupPenalty(
      { ...baseLineup, absences: [{ name: 'Backup fullback', importance: 'squad' }] },
      true
    );
    expect(result.penaltyPct).toBe(-6);
  });

  it('applies -3 for an unconfirmed but likely-correct expected XI', () => {
    const result = computeLineupPenalty({ ...baseLineup, confirmed: false, minutesToKickoff: null }, true);
    expect(result.penaltyPct).toBe(-3);
  });
});

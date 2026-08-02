// Unit tests for the VALUE GATE - the spec calls this "the single most important
// rule; make it impossible to bypass." These tests exist specifically to prove
// that a high-probability pick with no real edge is always rejected, no matter
// how confident the model was.
import { describe, expect, it } from 'vitest';
import { buildGatedPick, devigImpliedProbabilities, impliedProbabilityPct, runValueGate } from '../s7-gate';
import type { OddsQuote, PricedCandidate } from '../../types';

function odds(decimalOdds: number): OddsQuote {
  return { market: '1X2', side: 'home', decimalOdds, book: 'test-book', fetchedAt: new Date().toISOString() };
}

// Minimal but complete PricedCandidate for buildGatedPick tests - only `finalPct`
// varies between tests, everything else is filler that satisfies the type.
function candidateWithFinalPct(finalPct: number): PricedCandidate {
  return {
    fixture: {
      externalId: 'fx-1',
      leagueId: 999,
      competition: 'Test League',
      baseRateKey: 'TEST',
      isEuropean: false,
      home: { name: 'Home FC', externalId: 'h-1' },
      away: { name: 'Away FC', externalId: 'a-1' },
      kickoff: new Date().toISOString(),
    },
    market: '1X2',
    baseRatePct: 45,
    signals: [],
    motivation: { home: 'NEUTRAL', away: 'NEUTRAL' },
    penalties: { lineupPenaltyPct: 0, volatilityPenaltiesRaw: [], volatilityPenaltyAppliedPct: 0 },
    rawPct: finalPct,
    finalPct,
    breakThePick: {
      tacticalCounter: 'n/a',
      squadRotationCounter: 'n/a',
      situationalPrecedentCounter: 'n/a',
      severity: 'WEAK',
      penaltyPct: 0,
    },
  };
}

describe('impliedProbabilityPct', () => {
  it('converts decimal odds to a percentage', () => {
    expect(impliedProbabilityPct(2.0)).toBe(50);
    expect(impliedProbabilityPct(4.0)).toBe(25);
  });
});

describe('devigImpliedProbabilities', () => {
  it('normalizes overround odds so probabilities sum to 100', () => {
    // 1.90 / 3.80 / 4.20 has an overround above 100% (typical bookmaker margin).
    const result = devigImpliedProbabilities([1.9, 3.8, 4.2]);
    const total = result.reduce((s, p) => s + p, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

describe('runValueGate - the spec\'s worked example', () => {
  it('rejects the spec\'s literal example (85% at odds 1.10) via the 1.30 odds floor', () => {
    // The spec's own worked example (P_imp=91%, edge=-6%) uses odds below the
    // 1.30 floor, so it's rejected there before edge is even computed - still a
    // correct NO-PICK, just for a floor reason rather than a pure edge reason.
    const result = runValueGate({ finalPct: 85, tier: 'T0', freshOdds: odds(1.1) });
    expect(result.passes).toBe(false);
  });

  it('rejects a high-probability pick with genuinely negative edge above the odds floor', () => {
    // finalPct 70%, odds 1.35 (clears the 1.30 floor) -> implied ~74.1%, edge ~-4.1%.
    // High confidence must never override negative edge - this is the core rule.
    const result = runValueGate({ finalPct: 70, tier: 'T2', freshOdds: odds(1.35) });
    expect(result.passes).toBe(false);
    expect(result.edgePct).toBeLessThan(0);
  });
});

describe('runValueGate - edge floors', () => {
  it('passes when edge clears +2% for a non-LEAN tier', () => {
    // finalPct 70, odds 3.0 -> implied ~33.3%, edge ~36.7% - clearly passes.
    const result = runValueGate({ finalPct: 70, tier: 'T2', freshOdds: odds(3.0) });
    expect(result.passes).toBe(true);
  });

  it('rejects when edge is positive but under the +2% floor', () => {
    // finalPct 51, odds 2.0 -> implied 50%, edge 1% - below the 2% floor.
    const result = runValueGate({ finalPct: 51, tier: 'T2', freshOdds: odds(2.0) });
    expect(result.passes).toBe(false);
  });

  it('requires +3% (not +2%) edge for LEAN', () => {
    // finalPct 62, odds 2.6 -> implied ~38.46%, edge ~23.5% - comfortably passes
    // regardless of which floor applies, so use a tighter case instead.
    const tight = runValueGate({ finalPct: 63, tier: 'LEAN', freshOdds: odds(1.65) }); // implied ~60.6%, edge ~2.4%
    expect(tight.passes).toBe(false); // 2.4% clears +2 but not the +3 LEAN floor

    const nonLean = runValueGate({ finalPct: 63, tier: 'T2', freshOdds: odds(1.65) });
    expect(nonLean.passes).toBe(true); // same numbers, but +2% floor applies for T2
  });
});

describe('runValueGate - hard floors that cannot be bypassed', () => {
  it('rejects odds below the 1.30 floor even with a huge nominal edge', () => {
    const result = runValueGate({ finalPct: 89, tier: 'T0', freshOdds: odds(1.2) });
    expect(result.passes).toBe(false);
    expect(result.reason).toMatch(/1\.3/);
  });

  it('rejects when there are no live odds at all', () => {
    const result = runValueGate({ finalPct: 80, tier: 'T1', freshOdds: null });
    expect(result.passes).toBe(false);
  });

  it('flags (but does not itself reject) a gap over 15 points - that is buildGatedPick\'s job', () => {
    // finalPct 89, odds 20.0 -> implied 5%, edge 84% - way past the sanity threshold.
    // runValueGate still passes on the raw numbers; it's buildGatedPick's data-
    // confidence check that decides whether to trust it (see the test below).
    const result = runValueGate({ finalPct: 89, tier: 'T0', freshOdds: odds(20.0) });
    expect(result.passes).toBe(true);
    expect(result.largeGapFlag).toBe(true);
  });
});

describe('runValueGate - de-vigging', () => {
  it('uses the de-vigged implied probability when other outcomes are supplied', () => {
    const withDevig = runValueGate({
      finalPct: 55,
      tier: 'T2',
      freshOdds: odds(2.0),
      otherSideOdds: [3.6, 4.0],
    });
    const withoutDevig = runValueGate({ finalPct: 55, tier: 'T2', freshOdds: odds(2.0) });
    // De-vigged implied probability should be lower than the naive 50% (since the
    // overround is being stripped out and spread across the other outcomes too).
    expect(withDevig.impliedPct).not.toBeCloseTo(withoutDevig.impliedPct ?? 0, 1);
  });
});

describe('buildGatedPick - large-edge sanity check gated on data confidence', () => {
  it('rejects a huge edge when data confidence is weak (probable error, not real insight)', () => {
    const result = buildGatedPick({
      candidate: candidateWithFinalPct(89),
      market: '1X2',
      freshOdds: odds(20.0), // implied 5%, edge ~84% - way past the 15-point sanity threshold
      confidence: { model: 89, data: 50, lineup: 80 }, // weak data confidence
      currentLossStreakInTier: 0,
    });
    expect(result.isPick).toBe(false);
    expect(result.noPickReason).toMatch(/sanity threshold/);
  });

  it('accepts a huge edge when data confidence is clean', () => {
    const result = buildGatedPick({
      candidate: candidateWithFinalPct(89),
      market: '1X2',
      freshOdds: odds(20.0),
      confidence: { model: 89, data: 90, lineup: 90 }, // clean data
      currentLossStreakInTier: 0,
    });
    expect(result.isPick).toBe(true);
    expect(result.tier).toBe('T0');
  });
});

describe('buildGatedPick - confidence-decomposition downgrade', () => {
  it('downgrades one tier when data confidence is far below model confidence (the spec\'s 80/55 example)', () => {
    const result = buildGatedPick({
      candidate: candidateWithFinalPct(80), // would be T1 (76-83) on probability alone
      market: '1X2',
      freshOdds: odds(1.4), // implied ~71.4%, edge ~8.6% - clears the floor without tripping the large-gap check
      confidence: { model: 80, data: 55, lineup: 70 },
      currentLossStreakInTier: 0,
    });
    expect(result.tier).toBe('T2'); // downgraded one tier from T1
  });
});

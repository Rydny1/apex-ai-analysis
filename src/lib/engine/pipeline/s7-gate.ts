// The VALUE GATE - S7 in the spec, and the single most important rule in the
// whole system: "Probability of an outcome is not a reason to bet. Edge over the
// market is." This file is written so the gate cannot be skipped or fudged -
// every candidate goes through `runValueGate` no matter how high its probability
// is, and a high-probability pick with no edge comes out NO-PICK every time.

import type { ConfidenceDecomposition, GatedPick, MarketCode, OddsQuote, PricedCandidate, Tier } from '../types';
import { assignTier, baseStakePct, applyLossStreakAdjustment, marketAllowedForTier } from './tiering';

export const ODDS_FLOOR = 1.3; // spec: "Skip anything below the 1.30 odds floor."
export const MIN_EDGE_PCT = 2.0; // spec: minimum edge, any tier
export const MIN_EDGE_PCT_LEAN = 3.0; // spec: LEAN needs more cushion, noisier estimate
export const SANITY_GAP_PCT = 15; // spec: ">15% gap between probability and implied -> re-examine"

export function impliedProbabilityPct(decimalOdds: number): number {
  return (1 / decimalOdds) * 100;
}

// Removes the book's margin (the "overround") so the implied probabilities of
// every outcome in a market sum to exactly 100% instead of, say, 106%. Needs the
// odds for every outcome in the market - if we only have one side, we fall back
// to the un-de-vigged number in `runValueGate` below.
export function devigImpliedProbabilities(decimalOddsList: number[]): number[] {
  const rawProbabilities = decimalOddsList.map((odds) => 1 / odds);
  const overround = rawProbabilities.reduce((sum, p) => sum + p, 0);
  return rawProbabilities.map((p) => (p / overround) * 100);
}

export interface ValueGateInput {
  finalPct: number; // the built probability, already capped at the 89% ceiling upstream
  tier: Tier;
  freshOdds: OddsQuote | null; // S7's own fresh re-pull - never the S3 snapshot
  otherSideOdds?: number[]; // other outcomes' fresh odds, enables de-vigging when present
}

export interface ValueGateResult {
  impliedPct: number | null;
  edgePct: number | null;
  passes: boolean;
  reason: string;
  // True when the probability-vs-implied gap exceeds the spec's 15-point sanity
  // threshold. This does NOT auto-reject on its own - a genuinely mispriced market
  // can legitimately show a large edge, and blocking every big edge would gut the
  // whole point of the system. Instead the caller (buildGatedPick, below) only
  // trusts a flagged large edge when data confidence is also high; a large edge
  // paired with shaky data is exactly the "probable error" case the spec means.
  largeGapFlag: boolean;
}

export function runValueGate(input: ValueGateInput): ValueGateResult {
  if (!input.freshOdds) {
    return { impliedPct: null, edgePct: null, passes: false, largeGapFlag: false, reason: 'No live odds available for this market/line at output time.' };
  }

  if (input.freshOdds.decimalOdds < ODDS_FLOOR) {
    return { impliedPct: null, edgePct: null, passes: false, largeGapFlag: false, reason: `Odds ${input.freshOdds.decimalOdds.toFixed(2)} are below the ${ODDS_FLOOR} floor.` };
  }

  const impliedPct =
    input.otherSideOdds && input.otherSideOdds.length > 0
      ? devigImpliedProbabilities([input.freshOdds.decimalOdds, ...input.otherSideOdds])[0]
      : impliedProbabilityPct(input.freshOdds.decimalOdds);

  const edgePct = input.finalPct - impliedPct;
  const minEdge = input.tier === 'LEAN' ? MIN_EDGE_PCT_LEAN : MIN_EDGE_PCT;
  const largeGapFlag = Math.abs(input.finalPct - impliedPct) > SANITY_GAP_PCT;

  if (edgePct < minEdge) {
    return { impliedPct, edgePct, passes: false, largeGapFlag, reason: `Edge +${edgePct.toFixed(1)}% is below the +${minEdge}% floor required for ${input.tier}.` };
  }

  return { impliedPct, edgePct, passes: true, largeGapFlag, reason: `Edge +${edgePct.toFixed(1)}% clears the +${minEdge}% floor.` };
}

// Spec S7 rule: "A pick with model confidence 80% but data confidence 55% is
// downgraded one tier or held." No exact numeric threshold is given beyond that
// example (a 25-point gap), so this build's documented default is: a data
// confidence below 60, or a model-vs-data gap over 20 points, triggers a
// one-tier downgrade - and if the pick is already at LEAN, that means a hold.
const DOWNGRADE_TIER_ORDER: Tier[] = ['T0', 'T1', 'T2', 'LEAN', 'NO-PICK'];
function downgradeOneTier(tier: Tier): Tier {
  const index = DOWNGRADE_TIER_ORDER.indexOf(tier);
  return DOWNGRADE_TIER_ORDER[Math.min(index + 1, DOWNGRADE_TIER_ORDER.length - 1)];
}

function needsConfidenceDowngrade(confidence: ConfidenceDecomposition): boolean {
  return confidence.data < 60 || confidence.model - confidence.data > 20;
}

export interface BuildGatedPickInput {
  candidate: PricedCandidate;
  market: MarketCode;
  freshOdds: OddsQuote | null;
  otherSideOdds?: number[];
  confidence: ConfidenceDecomposition;
  currentLossStreakInTier: number;
}

// Wires the gate together with tiering: assigns the tier from probability, applies
// the confidence-decomposition downgrade, checks the market is allowed for that
// tier (LEAN is restricted to high-base-rate markets), runs the VALUE GATE, and
// only then sizes the stake. Any failure along the way produces a fully-explained
// NO-PICK rather than silently dropping the candidate.
export function buildGatedPick(input: BuildGatedPickInput): GatedPick {
  let tier = assignTier(input.candidate.finalPct);

  if (tier !== 'NO-PICK' && needsConfidenceDowngrade(input.confidence)) {
    tier = downgradeOneTier(tier);
  }

  if (tier === 'NO-PICK') {
    return {
      candidate: input.candidate,
      freshOdds: input.freshOdds,
      impliedPct: null,
      edgePct: null,
      tier,
      stakePct: 0,
      confidence: input.confidence,
      isPick: false,
      noPickReason: `Probability ${input.candidate.finalPct}% falls below the 60% floor.`,
    };
  }

  if (!marketAllowedForTier(tier, input.market)) {
    return {
      candidate: input.candidate,
      freshOdds: input.freshOdds,
      impliedPct: null,
      edgePct: null,
      tier: 'NO-PICK',
      stakePct: 0,
      confidence: input.confidence,
      isPick: false,
      noPickReason: `${input.market} is not a high-base-rate market and this pick only reaches LEAN confidence.`,
    };
  }

  const gate = runValueGate({
    finalPct: input.candidate.finalPct,
    tier,
    freshOdds: input.freshOdds,
    otherSideOdds: input.otherSideOdds,
  });

  if (!gate.passes) {
    return {
      candidate: input.candidate,
      freshOdds: input.freshOdds,
      impliedPct: gate.impliedPct,
      edgePct: gate.edgePct,
      tier: 'NO-PICK',
      stakePct: 0,
      confidence: input.confidence,
      isPick: false,
      noPickReason: gate.reason,
    };
  }

  // The gate passed on the numbers alone. A very large edge (>15 points) is only
  // trusted when the data behind it was clean - a big edge built on incomplete or
  // guessed data is exactly the "probable error" case the spec's sanity check is
  // for, so require high data confidence (>=80) before accepting it as real.
  if (gate.largeGapFlag && input.confidence.data < 80) {
    return {
      candidate: input.candidate,
      freshOdds: input.freshOdds,
      impliedPct: gate.impliedPct,
      edgePct: gate.edgePct,
      tier: 'NO-PICK',
      stakePct: 0,
      confidence: input.confidence,
      isPick: false,
      noPickReason: `Edge +${gate.edgePct?.toFixed(1)}% exceeds the ${SANITY_GAP_PCT}-point sanity threshold and data confidence (${input.confidence.data}%) isn't clean enough to trust it - held for review instead of bet on.`,
    };
  }

  const stake = applyLossStreakAdjustment(baseStakePct(tier, input.candidate.finalPct), input.currentLossStreakInTier);

  return {
    candidate: input.candidate,
    freshOdds: input.freshOdds,
    impliedPct: gate.impliedPct,
    edgePct: gate.edgePct,
    tier,
    stakePct: stake,
    confidence: input.confidence,
    isPick: true,
    noPickReason: null,
  };
}

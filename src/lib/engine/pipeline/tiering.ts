// Tiering and stake sizing - straight from the spec's TIERS, STAKES & MARKETS
// table and the BANKROLL rules. This is pure math: probability in, tier and a
// stake percentage out. It does NOT decide whether a bet is placed at all - that
// is the VALUE GATE's job (see s7-gate.ts). A match can be "T0" by probability
// and still end up NO-PICK if the edge over the market is negative.

import type { MarketCode, Tier } from '../types';

const HIGH_BASE_RATE_MARKETS: MarketCode[] = ['O/U', 'DC', 'TT']; // corners O/U counts too, handled by caller passing 'CRN' + line context

interface TierBand {
  tier: Tier;
  minPct: number;
  maxPct: number;
  stakeMin: number;
  stakeMax: number;
}

// Ordered highest-probability first so the first match wins.
const TIER_BANDS: TierBand[] = [
  { tier: 'T0', minPct: 84, maxPct: 89, stakeMin: 4, stakeMax: 5 },
  { tier: 'T1', minPct: 76, maxPct: 83, stakeMin: 3, stakeMax: 4 },
  { tier: 'T2', minPct: 67, maxPct: 75, stakeMin: 2, stakeMax: 3 },
  { tier: 'LEAN', minPct: 60, maxPct: 66, stakeMin: 1, stakeMax: 1.5 },
];

const HARD_CEILING_PCT = 89;
const STAKE_FLOOR_PCT = 1;
const STAKE_CEILING_PCT = 5;

export function assignTier(finalPct: number): Tier {
  const cappedPct = Math.min(finalPct, HARD_CEILING_PCT); // the 89% hard ceiling, no exceptions
  const band = TIER_BANDS.find((b) => cappedPct >= b.minPct && cappedPct <= b.maxPct);
  return band ? band.tier : 'NO-PICK';
}

// LEAN tier is restricted to the spec's high-base-rate market list. Everything
// else (T0-T2) can use any of the spec's allowed markets.
export function marketAllowedForTier(tier: Tier, market: MarketCode): boolean {
  if (tier === 'NO-PICK') return false;
  if (tier !== 'LEAN') return true;
  return HIGH_BASE_RATE_MARKETS.includes(market) || market === 'CRN';
}

// Stake sizing within a tier's band: scales linearly from the band's floor to its
// ceiling based on how close the probability sits to the top of its own band. The
// spec gives the range but not a within-band formula, so this is this build's
// documented default - a pick that just barely qualifies for a tier gets the
// tier's minimum stake, one that's almost into the next tier up gets the max.
export function baseStakePct(tier: Tier, finalPct: number): number {
  const band = TIER_BANDS.find((b) => b.tier === tier);
  if (!band) return 0;
  const span = band.maxPct - band.minPct;
  const position = span === 0 ? 1 : (Math.min(finalPct, band.maxPct) - band.minPct) / span;
  const stake = band.stakeMin + position * (band.stakeMax - band.stakeMin);
  return Math.round(stake * 100) / 100;
}

// BANKROLL rule: three losses in a row in one tier halves stakes in that tier
// until two wins restore it. Applied last, after the base stake is computed, and
// still respects the spec's absolute floor/ceiling (never below 1%, never above 5%).
export function applyLossStreakAdjustment(baseStake: number, currentLossStreakInTier: number): number {
  const adjusted = currentLossStreakInTier >= 3 ? baseStake / 2 : baseStake;
  return Math.max(STAKE_FLOOR_PCT, Math.min(STAKE_CEILING_PCT, adjusted));
}
